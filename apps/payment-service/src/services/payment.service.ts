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

  async getSubscriptionsForUser(userId: string): Promise<Subscription[]> {
    const subscriptions = await this.subscriptionService.findByUserId(userId);

    // Enrich subscriptions missing productName
    const toEnrich = subscriptions.filter((s) => !s.productName);
    if (toEnrich.length > 0) {
      const productIds = [...new Set(toEnrich.map((s) => s.productId))];
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

      for (const sub of toEnrich) {
        const product = products.get(sub.productId);
        const name = (product?.nameFr as string) || (product?.nameEn as string);
        if (name) {
          sub.productName = name;
          // Fire-and-forget DB update
          this.subscriptionService.update(sub.id, { productName: name });
        }
      }
    }

    return subscriptions;
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
      currentPeriodStart: (stripeSubscription as unknown as Record<string, number>)
        .current_period_start
        ? new Date(
            (stripeSubscription as unknown as Record<string, number>).current_period_start * 1000,
          )
        : new Date(),
      currentPeriodEnd: (stripeSubscription as unknown as Record<string, number>).current_period_end
        ? new Date(
            (stripeSubscription as unknown as Record<string, number>).current_period_end * 1000,
          )
        : new Date(),
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
