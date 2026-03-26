import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { Subscription } from '../entities/subscription.entity';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { SubscriptionStatus } from '@cyna-api/common';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    @Inject(SERVICE_NAMES.CATALOG) private readonly catalogClient: ClientProxy,
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
  ) {}

  async createPaymentIntent(dto: CreatePaymentIntentDto): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  }> {
    const currency = (dto.currency || 'EUR').toLowerCase();

    // Amount from the order is already calculated server-side (subtotal + tax)
    // Convert to cents for Stripe
    const amountInCents = Math.round(dto.amount * 100);

    if (amountInCents <= 0) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payment amount',
        code: 'INVALID_AMOUNT',
      });
    }

    // Create Payment Intent via Stripe
    const paymentIntent = await this.stripeService.createPaymentIntent(amountInCents, currency, {
      orderId: dto.orderId,
      userId: dto.userId || '',
      guestEmail: dto.guestEmail || '',
    });

    this.logger.log(
      `Payment Intent created: ${paymentIntent.id} for amount ${amountInCents} ${currency}`,
    );

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      currency,
    };
  }

  async getSubscriptionsForUser(userId: string): Promise<Record<string, unknown>[]> {
    const subscriptions = await this.subscriptionService.findByUserId(userId);

    // Sync status with Stripe and enrich with product data
    const productIds = [...new Set(subscriptions.map((s) => s.productId))];
    const products = new Map<string, Record<string, unknown>>();

    for (const productId of productIds) {
      try {
        const product = await firstValueFrom(
          this.catalogClient
            .send(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: productId })
            .pipe(
              timeout(3000),
              catchError(() => throwError(() => null)),
            ),
        );
        if (product) products.set(productId, product);
      } catch {
        // Skip if catalog is unavailable
      }
    }

    const enriched: Record<string, unknown>[] = [];

    for (const sub of subscriptions) {
      // Sync with Stripe to get real status and dates
      try {
        const stripeSub = await this.stripeService.getSubscription(sub.stripeSubscriptionId);
        const raw = stripeSub as unknown as Record<string, unknown>;
        const stripeStatus = this.mapStripeStatus(stripeSub.status);
        const cancelAtPeriodEnd = !!raw.cancel_at_period_end;

        // Stripe API 2026-01-28: uses start_date and cancel_at instead of current_period_start/end
        const startTs = raw.current_period_start ?? raw.start_date;
        const endTs = raw.current_period_end ?? raw.cancel_at;
        const periodStart =
          typeof startTs === 'number' ? new Date(startTs * 1000) : sub.currentPeriodStart;
        let periodEnd = typeof endTs === 'number' ? new Date(endTs * 1000) : sub.currentPeriodEnd;

        // If no end date from Stripe, compute from start + billing period
        if (!endTs && typeof startTs === 'number') {
          const start = new Date(startTs * 1000);
          periodEnd =
            sub.billingPeriod === 'yearly'
              ? new Date(start.setFullYear(start.getFullYear() + 1))
              : new Date(start.setMonth(start.getMonth() + 1));
        }

        // Update DB if changed
        if (
          sub.status !== stripeStatus ||
          sub.cancelAtPeriodEnd !== cancelAtPeriodEnd ||
          sub.currentPeriodEnd?.getTime() !== periodEnd?.getTime()
        ) {
          this.subscriptionService.update(sub.id, {
            status: stripeStatus,
            cancelAtPeriodEnd,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          });
          sub.status = stripeStatus;
          sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
          sub.currentPeriodStart = periodStart;
          sub.currentPeriodEnd = periodEnd;
        }
      } catch {
        this.logger.warn(`Failed to sync subscription ${sub.id} with Stripe`);
      }

      // Enrich with product data
      const product = products.get(sub.productId);
      if (product && !sub.productName) {
        const name = (product.nameFr as string) || (product.nameEn as string);
        if (name) {
          sub.productName = name;
          this.subscriptionService.update(sub.id, { productName: name });
        }
      }

      const productData = product as Record<string, unknown> | undefined;
      const images = productData?.images as Array<Record<string, unknown>> | undefined;
      const primaryImage =
        (productData?.primaryImageUrl as string) ||
        (images?.find((img) => img.isPrimary)?.imageUrl as string) ||
        (images?.[0]?.imageUrl as string) ||
        null;

      enriched.push({
        ...sub,
        productImageUrl: primaryImage,
      });
    }

    return enriched;
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
      case 'trialing':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
      case 'cancelled':
        return SubscriptionStatus.CANCELLED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      case 'incomplete':
      case 'incomplete_expired':
        return SubscriptionStatus.CANCELLED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }

  async createSubscription(dto: CreateSubscriptionDto): Promise<{
    clientSecret: string;
    subscriptionId: string;
  }> {
    // 1. Get the user from Auth Service (for stripeCustomerId)
    const user = await firstValueFrom(
      this.authClient.send(MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID, { userId: dto.userId }).pipe(
        timeout(5000),
        retry(2),
        catchError((err) => {
          if (err instanceof TimeoutError) {
            return throwError(
              () =>
                new RpcException({
                  statusCode: 503,
                  message: 'Auth service timeout',
                  code: 'AUTH_SERVICE_TIMEOUT',
                }),
            );
          }
          return throwError(() => err);
        }),
      ),
    );

    // 2. If no stripeCustomerId, create a Stripe Customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeService.createCustomer(
        user.email,
        user.name || user.email,
        { userId: dto.userId },
      );
      stripeCustomerId = customer.id;

      // Update user with stripeCustomerId via Auth Service
      this.authClient.emit('auth.update_stripe_customer_id', {
        userId: dto.userId,
        stripeCustomerId,
      });
    }

    // 3. Get the product from Catalog Service (for stripePriceId)
    const product = await firstValueFrom(
      this.catalogClient
        .send(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: dto.productId })
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
    );

    if (!product) {
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // 4. Determine the stripePriceId based on billingPeriod
    const stripePriceId =
      dto.billingPeriod === 'monthly' ? product.stripePriceIdMonthly : product.stripePriceIdYearly;

    if (!stripePriceId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Product does not have a Stripe price configured',
        code: 'STRIPE_PRICE_NOT_CONFIGURED',
      });
    }

    // 5. Create the Stripe Subscription
    const stripeSubscription = await this.stripeService.createSubscription(
      stripeCustomerId,
      stripePriceId,
      {
        userId: dto.userId,
        productId: dto.productId,
        billingPeriod: dto.billingPeriod,
      },
    );

    // 6. Save in database
    const subscription = await this.subscriptionService.create({
      userId: dto.userId,
      productId: dto.productId,
      productName: product.nameFr || product.nameEn || null,
      status: SubscriptionStatus.ACTIVE,
      billingPeriod: dto.billingPeriod,
      price:
        Number(dto.billingPeriod === 'monthly' ? product.priceMonthly : product.priceYearly) || 0,
      currency: 'EUR',
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId,
      stripePriceId,
      currentPeriodStart: (() => {
        const raw = stripeSubscription as unknown as Record<string, unknown>;
        const ts = raw.current_period_start ?? raw.start_date;
        return typeof ts === 'number' ? new Date(ts * 1000) : new Date();
      })(),
      currentPeriodEnd: (() => {
        const raw = stripeSubscription as unknown as Record<string, unknown>;
        const ts = raw.current_period_end ?? raw.cancel_at;
        if (typeof ts === 'number') return new Date(ts * 1000);
        // Compute from start + billing period
        const startTs = raw.current_period_start ?? raw.start_date;
        const start = typeof startTs === 'number' ? new Date(startTs * 1000) : new Date();
        return dto.billingPeriod === 'yearly'
          ? new Date(new Date(start).setFullYear(start.getFullYear() + 1))
          : new Date(new Date(start).setMonth(start.getMonth() + 1));
      })(),
    });

    // 7. Get clientSecret via latest_invoice.confirmation_secret (Stripe API 2026-01-28.clover)
    // See: https://docs.stripe.com/payments/advanced/build-subscriptions
    const invoice =
      typeof stripeSubscription.latest_invoice === 'string'
        ? await this.stripeService.getInvoice(stripeSubscription.latest_invoice)
        : stripeSubscription.latest_invoice;

    if (!invoice) {
      throw new RpcException({
        statusCode: 500,
        message: 'No invoice on subscription',
        code: 'SUBSCRIPTION_NO_INVOICE',
      });
    }

    const clientSecret = invoice.confirmation_secret?.client_secret;

    if (!clientSecret) {
      throw new RpcException({
        statusCode: 500,
        message: 'Failed to get client secret from subscription',
        code: 'SUBSCRIPTION_CLIENT_SECRET_MISSING',
      });
    }

    this.logger.log(`Subscription created: ${subscription.id} (Stripe: ${stripeSubscription.id})`);

    return {
      clientSecret,
      subscriptionId: subscription.id,
    };
  }
}
