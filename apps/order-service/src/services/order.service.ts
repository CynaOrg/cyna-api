import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  EVENT_PATTERNS,
  Language,
  OrderStatus,
  OrderType,
  ProductType,
} from '@cyna-api/common';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { CartService } from './cart.service';

interface CatalogProduct {
  id: string;
  productType: string;
  priceMonthly?: number | string;
  priceYearly?: number | string;
  priceUnit?: number | string;
  price?: number | string;
  nameFr?: string;
  nameEn?: string;
  slug?: string;
  images?: Array<{ imageUrl?: string }>;
}

/**
 * Stable shape returned by `adminGetOrders`. Explicitly exposes
 * `customerEmail` (populated for both guest and authenticated orders since the
 * `RenameGuestEmailToCustomerEmail` migration) so the back-office can render
 * a human-readable identifier instead of the raw user UUID — see audit ORD-1.
 */
export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerEmail: string;
  notificationEmail: string | null;
  status: OrderStatus;
  orderType: OrderType;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  stripePaymentIntentId: string | null;
  stripeInvoiceUrl: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  notes: string | null;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly cartService: CartService,
    @Inject(SERVICE_NAMES.CATALOG) private readonly catalogClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.USER) private readonly userClient: ClientProxy,
  ) {}

  async generateOrderNumber(): Promise<string> {
    // MAX on the trailing sequence, not COUNT — deleted rows (e.g. legacy
    // guest orphans purged in 1776900000000) make COUNT+1 collide with
    // existing numbers.
    const year = new Date().getFullYear();
    const prefix = `CYN-${year}-`;
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select(
        `COALESCE(MAX(CAST(SPLIT_PART(order.order_number, '-', 3) AS INTEGER)), 0)`,
        'max_seq',
      )
      .where('order.order_number LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max_seq: string | number }>();
    const nextSeq = Number(result?.max_seq ?? 0) + 1;
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  async createOrderFromCart(data: {
    userId?: string;
    cartId: string;
    billingAddress: Record<string, unknown>;
    shippingAddress?: Record<string, unknown>;
    email: string;
    preferredLanguage?: Language;
    stripePaymentIntentId: string;
  }): Promise<Order> {
    // Idempotence: if a pending order already exists for this cart, reuse it
    // so the gateway can fetch the existing Stripe PaymentIntent's client
    // secret instead of creating a fresh one. The address snapshots are
    // refreshed in case the customer changed them between attempts.
    const existing = await this.orderRepository.findOne({
      where: { cartId: data.cartId, status: OrderStatus.PENDING },
    });
    if (existing) {
      let mutated = false;
      if (data.billingAddress) {
        existing.billingAddressSnapshot = data.billingAddress;
        mutated = true;
      }
      if (data.shippingAddress !== undefined) {
        existing.shippingAddressSnapshot = data.shippingAddress ?? null;
        mutated = true;
      }
      if (data.email && data.email !== existing.customerEmail) {
        existing.customerEmail = data.email;
        existing.notificationEmail = data.email;
        mutated = true;
      }
      if (mutated) await this.orderRepository.save(existing);
      this.logger.log(`Reusing pending order ${existing.orderNumber} for cart ${data.cartId}`);
      const reloaded = await this.orderRepository.findOne({
        where: { id: existing.id },
        relations: ['items'],
      });
      return reloaded ?? existing;
    }

    // 1. Get the cart by its database ID
    const cartEntity = await this.cartService.findCartById(data.cartId);
    if (!cartEntity) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.order.cartNotFound',
        code: 'CART_NOT_FOUND',
      });
    }

    // Get enriched cart with product data
    const cart = await this.cartService.getCart({
      userId: cartEntity.userId ?? undefined,
      sessionId: cartEntity.sessionId ?? undefined,
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.order.cartEmpty',
        code: 'CART_EMPTY',
      });
    }

    // 2. Get products from catalog to calculate prices server-side.
    // Single batched RPC call to avoid N+1 round-trips over RabbitMQ.
    const productIds = cart.items.map((item: { productId: string }) => item.productId);
    const products = await firstValueFrom(
      this.catalogClient
        .send<CatalogProduct[]>(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_IDS, { ids: productIds })
        .pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((err) => {
            if (err instanceof TimeoutError) {
              return throwError(
                () =>
                  new RpcException({
                    statusCode: 503,
                    message: 'errors.order.catalogServiceTimeout',
                    code: 'CATALOG_SERVICE_TIMEOUT',
                  }),
              );
            }
            return throwError(() => err);
          }),
        ),
    );

    const productMap = new Map(products.map((p: CatalogProduct) => [p.id, p]));

    // 3. Determine order type and calculate totals
    const productTypes = new Set<string>();
    let subtotal = 0;
    const orderItems: Partial<OrderItem>[] = [];

    for (const cartItem of cart.items) {
      const product = productMap.get(cartItem.productId);
      if (!product) {
        throw new RpcException({
          statusCode: 404,
          message: `Product ${cartItem.productId} not found`,
          code: 'PRODUCT_NOT_FOUND',
        });
      }

      productTypes.add(product.productType);

      // Determine price based on billing period
      let unitPrice: number;
      if (cartItem.billingPeriod === 'monthly') {
        unitPrice = Number(product.priceMonthly || product.price);
      } else if (cartItem.billingPeriod === 'yearly') {
        unitPrice = Number(product.priceYearly || product.price);
      } else {
        unitPrice = Number(product.priceUnit || product.price);
      }

      const totalPrice = unitPrice * cartItem.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: cartItem.productId,
        productSnapshot: {
          name: product.nameFr || product.nameEn,
          nameEn: product.nameEn,
          nameFr: product.nameFr,
          slug: product.slug,
          productType: product.productType,
          price: unitPrice,
          image: product.images?.[0]?.imageUrl || null,
        },
        quantity: cartItem.quantity,
        unitPrice,
        totalPrice,
        billingPeriod: cartItem.billingPeriod,
      });
    }

    // Determine order type
    let orderType: OrderType;
    if (productTypes.size > 1) {
      orderType = OrderType.MIXED;
    } else {
      const type = [...productTypes][0];
      orderType =
        type === ProductType.PHYSICAL
          ? OrderType.PHYSICAL
          : type === ProductType.LICENSE
            ? OrderType.LICENSE
            : OrderType.SAAS;
    }

    // 4. Calculate tax (simplified: 20% VAT for EU)
    const taxAmount = Math.round(subtotal * 0.2 * 100) / 100;
    const total = subtotal + taxAmount;

    // 5. Generate order number and save, retrying on concurrent collisions.
    // MAX+1 is still racy under parallel creates, so we retry up to 5 times
    // on the unique violation (23505) before giving up.
    let savedOrder: Order | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const orderNumber = await this.generateOrderNumber();
      const order = this.orderRepository.create({
        orderNumber,
        userId: data.userId || null,
        cartId: data.cartId,
        customerEmail: data.email,
        notificationEmail: data.email,
        notificationLanguage: data.preferredLanguage ?? Language.FR,
        status: OrderStatus.PENDING,
        orderType,
        subtotal,
        taxAmount,
        shippingAmount: 0,
        discountAmount: 0,
        total,
        currency: 'EUR',
        billingAddressSnapshot: data.billingAddress,
        shippingAddressSnapshot: data.shippingAddress || null,
        stripePaymentIntentId: data.stripePaymentIntentId,
      });
      try {
        savedOrder = await this.orderRepository.save(order);
        break;
      } catch (err) {
        lastError = err;
        const code = (err as { code?: string }).code;
        if (code === '23505') {
          this.logger.warn(
            `Order number ${orderNumber} collided, retrying (attempt ${attempt + 1}/5)`,
          );
          continue;
        }
        throw err;
      }
    }
    if (!savedOrder) {
      throw lastError ?? new Error('Failed to save order after retries');
    }

    // 7. Create OrderItems
    for (const item of orderItems) {
      const orderItem = this.orderItemRepository.create({
        ...item,
        orderId: savedOrder.id,
      });
      await this.orderItemRepository.save(orderItem);
    }

    // The cart is intentionally NOT cleared here. We keep it alive until the
    // Stripe webhook flips the order to PAID (see `handlePaymentConfirmed`)
    // so a customer abandoning checkout — or returning to it later — still
    // sees their basket and can pay without recreating it.

    this.logger.log(`Order created: ${savedOrder.orderNumber} (${savedOrder.id})`);

    // Reload with items
    const reloaded = await this.orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['items'],
    });
    return reloaded!;
  }

  async handlePaymentConfirmed(
    paymentIntentId: string,
    invoice: { stripeInvoiceId: string | null; stripeInvoiceUrl: string | null } = {
      stripeInvoiceId: null,
      stripeInvoiceUrl: null,
    },
  ): Promise<void> {
    const order = await this.getOrderByPaymentIntentId(paymentIntentId);
    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntentId}`);
      return;
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    if (invoice.stripeInvoiceId) order.stripeInvoiceId = invoice.stripeInvoiceId;
    if (invoice.stripeInvoiceUrl) order.stripeInvoiceUrl = invoice.stripeInvoiceUrl;
    await this.orderRepository.save(order);

    this.logger.log(
      `Order ${order.orderNumber} marked as PAID${invoice.stripeInvoiceUrl ? ' (invoice attached)' : ''}`,
    );

    // Now that payment is confirmed, the cart this order was created from
    // can finally be cleared. Best-effort: a missing cart row (e.g. expired
    // guest session) must not roll back the PAID state.
    if (order.cartId) {
      try {
        const cartEntity = await this.cartService.findCartById(order.cartId);
        if (cartEntity) {
          await this.cartService.clearCart({
            userId: cartEntity.userId ?? undefined,
            sessionId: cartEntity.sessionId ?? undefined,
          });
        }
      } catch (err) {
        this.logger.warn(
          `clearCart on PAID order ${order.orderNumber} failed: ${(err as Error).message}`,
        );
      }
    }

    // Confirm stock
    for (const item of order.items) {
      this.catalogClient.emit(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, {
        productId: item.productId,
        quantity: item.quantity,
      });
    }
  }

  async handlePaymentFailed(paymentIntentId: string): Promise<void> {
    const order = await this.getOrderByPaymentIntentId(paymentIntentId);
    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntentId}`);
      return;
    }

    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    this.logger.log(`Order ${order.orderNumber} CANCELLED due to payment failure`);

    // Release stock
    for (const item of order.items) {
      this.catalogClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RELEASED, {
        productId: item.productId,
        quantity: item.quantity,
      });
    }
  }

  async handlePaymentRefunded(paymentIntentId: string): Promise<void> {
    const order = await this.getOrderByPaymentIntentId(paymentIntentId);
    if (!order) {
      this.logger.error(`Order not found for refund, payment intent: ${paymentIntentId}`);
      return;
    }

    order.status = OrderStatus.REFUNDED;
    await this.orderRepository.save(order);

    this.logger.log(`Order ${order.orderNumber} marked as REFUNDED`);
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    // PENDING is a server-side staging state created the moment the customer
    // clicks "continue to payment" — before any card is submitted to Stripe.
    // If they bail out without paying, Stripe never fires a webhook and the
    // row stays PENDING forever, but it does not represent an order the user
    // owes money on. Surfacing it here misled customers into thinking they
    // had an unpayable order (no "retry payment" UI exists in the dashboard).
    // The cart is kept alive precisely so they can resume checkout from /cart.
    // Admin reads go through `adminGetOrders`, which still shows everything.
    return this.orderRepository.find({
      where: { userId, status: Not(OrderStatus.PENDING) },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrderById(orderId: string, userId?: string): Promise<Order> {
    const where: FindOptionsWhere<Order> = { id: orderId };
    if (userId) {
      where.userId = userId;
      // Same rationale as `getOrdersByUserId` — PENDING orders are not
      // user-facing until the Stripe webhook flips them past it. Admin
      // lookups (no userId) keep full visibility.
      where.status = Not(OrderStatus.PENDING);
    }

    const order = await this.orderRepository.findOne({
      where,
      relations: ['items'],
    });

    if (!order) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.order.orderNotFound',
        code: 'ORDER_NOT_FOUND',
      });
    }

    return order;
  }

  async getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['items'],
    });
  }

  async adminGetOrders(params: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    orderType?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: AdminOrderListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { search, status, dateFrom, dateTo, orderType, userId, page = 1, limit = 20 } = params;

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .orderBy('order.createdAt', 'DESC');

    if (userId) {
      qb.andWhere('order.userId = :userId', { userId });
    }

    if (status) {
      qb.andWhere('order.status = :status', { status });
    }

    if (search) {
      qb.andWhere('(order.orderNumber ILIKE :search OR order.customerEmail ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(dateFrom) });
    }

    if (dateTo) {
      // If the caller provides a plain date (YYYY-MM-DD), normalize to end of day
      // so the filter is inclusive of the whole day from the UI perspective.
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
      const dateToValue = isDateOnly ? new Date(`${dateTo}T23:59:59.999Z`) : new Date(dateTo);
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: dateToValue });
    }

    if (orderType) {
      qb.andWhere('order.orderType = :orderType', { orderType });
    }

    const total = await qb.getCount();
    const orders = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // ORD-1: explicitly surface `customerEmail` (populated for both guest and
    // logged-in orders since the RenameGuestEmailToCustomerEmail migration) so
    // the admin UI can show a meaningful identifier instead of the raw user
    // UUID. We map to a stable, typed shape rather than leaking the entity
    // directly so future column additions stay opt-in.
    return {
      data: orders.map((o) => this.toAdminListItem(o)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toAdminListItem(order: Order): AdminOrderListItem {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      customerEmail: order.customerEmail,
      notificationEmail: order.notificationEmail,
      status: order.status,
      orderType: order.orderType,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      shippingAmount: order.shippingAmount,
      discountAmount: order.discountAmount,
      total: order.total,
      currency: order.currency,
      stripePaymentIntentId: order.stripePaymentIntentId,
      stripeInvoiceUrl: order.stripeInvoiceUrl,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      notes: order.notes,
      items: order.items,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async adminUpdateOrderStatus(
    orderId: string,
    status: string,
    notes?: string | null,
    trackingNumber?: string | null,
    trackingUrl?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items'],
    });

    if (!order) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.order.orderNotFound',
        code: 'ORDER_NOT_FOUND',
      });
    }

    const previousStatus = order.status;
    order.status = status as OrderStatus;

    if (notes !== undefined) {
      order.notes = notes;
    }

    if (trackingNumber !== undefined) {
      order.trackingNumber = trackingNumber;
    }

    if (trackingUrl !== undefined) {
      order.trackingUrl = trackingUrl;
    }

    // Set timestamps based on status transitions
    if (status === OrderStatus.PAID) {
      order.paidAt = new Date();
    }
    if (status === OrderStatus.SHIPPED) {
      order.shippedAt = new Date();
    }
    if (status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }

    await this.orderRepository.save(order);

    this.logger.log(`Admin updated order ${order.orderNumber} status to ${status}`);

    // Emit ORDER.SHIPPED only on the PAID -> SHIPPED transition to avoid
    // double-sending when an admin edits an already-shipped order.
    if (status === OrderStatus.SHIPPED && previousStatus !== OrderStatus.SHIPPED) {
      const email = order.notificationEmail ?? order.customerEmail;
      if (email) {
        this.notificationClient.emit(EVENT_PATTERNS.ORDER.SHIPPED, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          email,
          language: order.notificationLanguage ?? Language.FR,
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl,
        });
      }
    }

    return order;
  }

  async updateStripePaymentIntentId(orderId: string, stripePaymentIntentId: string): Promise<void> {
    await this.orderRepository.update(orderId, { stripePaymentIntentId });
    this.logger.log(`Order ${orderId} updated with payment intent ${stripePaymentIntentId}`);

    // Dev convenience: see comment in createOrderFromCart. The Stripe intent
    // ID is only known here (the gateway creates the order with an empty
    // intent ID then patches it after the payment service responds), so this
    // is where we schedule the local auto-confirm.
    if (
      process.env.LOCAL_AUTO_CONFIRM_PAYMENTS === 'true' &&
      process.env.NODE_ENV !== 'production' &&
      stripePaymentIntentId
    ) {
      setTimeout(() => {
        this.handlePaymentConfirmed(stripePaymentIntentId).catch((err) =>
          this.logger.error(
            `Dev auto-confirm failed for order ${orderId}: ${(err as Error).message}`,
          ),
        );
      }, 3000);
      this.logger.warn(
        `LOCAL_AUTO_CONFIRM_PAYMENTS=true — order ${orderId} will auto-mark PAID in 3s`,
      );
    }
  }
}
