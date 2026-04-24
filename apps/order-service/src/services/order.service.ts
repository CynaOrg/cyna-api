import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  EVENT_PATTERNS,
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
  ) {}

  async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.orderRepository
      .createQueryBuilder('order')
      .where('EXTRACT(YEAR FROM order.created_at) = :year', { year })
      .getCount();
    const sequence = String(count + 1).padStart(5, '0');
    return `CYN-${year}-${sequence}`;
  }

  async createOrderFromCart(data: {
    userId?: string;
    cartId: string;
    billingAddress: Record<string, unknown>;
    shippingAddress?: Record<string, unknown>;
    email: string;
    stripePaymentIntentId: string;
  }): Promise<Order> {
    // 1. Get the cart by its database ID
    const cartEntity = await this.cartService.findCartById(data.cartId);
    if (!cartEntity) {
      throw new RpcException({
        statusCode: 404,
        message: 'Cart not found',
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
        message: 'Cart is empty',
        code: 'CART_EMPTY',
      });
    }

    // 2. Get products from catalog to calculate prices server-side
    const productIds = cart.items.map((item: { productId: string }) => item.productId);
    const products = await Promise.all(
      productIds.map((productId: string) =>
        firstValueFrom(
          this.catalogClient
            .send(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: productId })
            .pipe(
              timeout(5000),
              retry(2),
              catchError((err) => {
                if (err instanceof TimeoutError) {
                  return throwError(
                    () =>
                      new RpcException({
                        statusCode: 503,
                        message: 'Catalog service timeout',
                        code: 'CATALOG_SERVICE_TIMEOUT',
                      }),
                  );
                }
                return throwError(() => err);
              }),
            ),
        ),
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

    // 4. Generate order number
    const orderNumber = await this.generateOrderNumber();

    // 5. Calculate tax (simplified: 20% VAT for EU)
    const taxAmount = Math.round(subtotal * 0.2 * 100) / 100;
    const total = subtotal + taxAmount;

    // 6. Create Order
    const order = this.orderRepository.create({
      orderNumber,
      userId: data.userId || null,
      guestEmail: data.userId ? null : data.email,
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

    const savedOrder = await this.orderRepository.save(order);

    // 7. Create OrderItems
    for (const item of orderItems) {
      const orderItem = this.orderItemRepository.create({
        ...item,
        orderId: savedOrder.id,
      });
      await this.orderItemRepository.save(orderItem);
    }

    // 8. Clear the cart
    await this.cartService.clearCart({
      userId: cartEntity.userId ?? undefined,
      sessionId: cartEntity.sessionId ?? undefined,
    });

    this.logger.log(`Order created: ${orderNumber} (${savedOrder.id})`);

    // Reload with items
    const reloaded = await this.orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['items'],
    });
    return reloaded!;
  }

  async handlePaymentConfirmed(paymentIntentId: string): Promise<void> {
    const order = await this.getOrderByPaymentIntentId(paymentIntentId);
    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntentId}`);
      return;
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    await this.orderRepository.save(order);

    this.logger.log(`Order ${order.orderNumber} marked as PAID`);

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
    return this.orderRepository.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrderById(orderId: string, userId?: string): Promise<Order> {
    const where: { id: string; userId?: string } = { id: orderId };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.orderRepository.findOne({
      where,
      relations: ['items'],
    });

    if (!order) {
      throw new RpcException({
        statusCode: 404,
        message: 'Order not found',
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
  }) {
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
      qb.andWhere('(order.orderNumber ILIKE :search OR order.guestEmail ILIKE :search)', {
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

    return {
      data: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async adminUpdateOrderStatus(
    orderId: string,
    status: string,
    notes?: string,
    trackingNumber?: string,
    trackingUrl?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items'],
    });

    if (!order) {
      throw new RpcException({
        statusCode: 404,
        message: 'Order not found',
        code: 'ORDER_NOT_FOUND',
      });
    }

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

    return order;
  }

  async updateStripePaymentIntentId(orderId: string, stripePaymentIntentId: string): Promise<void> {
    await this.orderRepository.update(orderId, { stripePaymentIntentId });
    this.logger.log(`Order ${orderId} updated with payment intent ${stripePaymentIntentId}`);
  }
}
