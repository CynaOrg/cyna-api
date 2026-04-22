import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import {
  SERVICE_NAMES,
  EVENT_PATTERNS,
  MESSAGE_PATTERNS,
  SubscriptionStatus,
} from '@cyna-api/common';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SubscriptionService } from './subscription.service';
import { LicenseService, OrderItemWithProduct } from './license.service';
import { WebhookPayloadDto } from '../dto/webhook-payload.dto';
import Stripe from 'stripe';

interface OrderForLicenseGeneration {
  id: string;
  userId: string | null;
  customerEmail: string;
  items: Array<{
    productId: string;
    productSnapshot: Record<string, unknown>;
    quantity: number;
  }>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(ProcessedWebhook)
    private readonly processedWebhookRepository: Repository<ProcessedWebhook>,
    private readonly subscriptionService: SubscriptionService,
    private readonly licenseService: LicenseService,
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  async handleWebhookEvent(payload: WebhookPayloadDto): Promise<void> {
    const { eventId, eventType, data } = payload;

    // 1. Check idempotence
    if (await this.isProcessed(eventId)) {
      this.logger.log(`Webhook ${eventId} already processed, skipping`);
      return;
    }

    this.logger.log(`Processing webhook: ${eventType} (${eventId})`);

    // 2. Route to handler based on event type
    try {
      switch (eventType) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(data);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(data);
          break;
        case 'invoice.paid':
          await this.handleInvoicePaid(data);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(data);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(data);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(data);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(data);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(data);
          break;
        default:
          this.logger.log(`Unhandled webhook event type: ${eventType}`);
      }

      // 3. Mark as processed
      await this.markProcessed(eventId, eventType);
    } catch (error) {
      this.logger.error(
        `Error processing webhook ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const existing = await this.processedWebhookRepository.findOne({
      where: { eventId },
    });
    return !!existing;
  }

  async markProcessed(eventId: string, eventType: string): Promise<void> {
    const webhook = this.processedWebhookRepository.create({
      eventId,
      eventType,
      processedAt: new Date(),
    });
    await this.processedWebhookRepository.save(webhook);
  }

  private async handlePaymentIntentSucceeded(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.id as string;
    const amount = data.amount as number;
    const metadata = (data.metadata as Record<string, unknown>) || {};

    this.logger.log(`Payment Intent succeeded: ${paymentIntentId}`);

    // 1. Resolve order via order-service RPC so we can generate licenses.
    //    Runs BEFORE emitting PAYMENT.CONFIRMED: if license generation fails we want
    //    Stripe to retry the whole webhook, leaving the order status un-flipped until
    //    the system is fully consistent.
    const order = await this.fetchOrderByPaymentIntent(paymentIntentId);

    if (order) {
      await this.generateLicensesForOrder(order);
    } else {
      this.logger.error(
        `No order found for payment intent ${paymentIntentId} — skipping license generation`,
      );
    }

    // 2. Emit event for Order Service to confirm the order
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });

    // 3. Emit event for Notification Service
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });
  }

  private async fetchOrderByPaymentIntent(
    paymentIntentId: string,
  ): Promise<OrderForLicenseGeneration | null> {
    return firstValueFrom(
      this.orderClient
        .send<OrderForLicenseGeneration | null>(
          MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT,
          { paymentIntentId },
        )
        .pipe(
          timeout(5000),
          retry(2),
          catchError((err: unknown) => {
            if (err instanceof TimeoutError) {
              this.logger.error(
                `Order service timeout resolving payment intent ${paymentIntentId}`,
              );
            } else {
              this.logger.error(
                `Order service error resolving payment intent ${paymentIntentId}: ${
                  err instanceof Error ? err.message : 'Unknown error'
                }`,
              );
            }
            return throwError(() => err);
          }),
        ),
    );
  }

  private async generateLicensesForOrder(order: OrderForLicenseGeneration): Promise<void> {
    // Idempotence: the outer processed_webhooks table dedupes by Stripe eventId,
    // but a retry of the same eventId re-enters this code path before the row is
    // saved. Short-circuit if licenses already exist for this order.
    const existing = await this.licenseService.findByOrderId(order.id);
    if (existing.length > 0) {
      this.logger.log(
        `Licenses already generated for order ${order.id} (${existing.length} existing) — skipping`,
      );
      return;
    }

    const items: OrderItemWithProduct[] = order.items.map((item) => {
      const snapshot = item.productSnapshot as {
        productType?: string;
        nameFr?: string;
        nameEn?: string;
        slug?: string;
      };
      return {
        productId: item.productId,
        productType: snapshot.productType ?? 'unknown',
        quantity: item.quantity,
        email: order.customerEmail,
        userId: order.userId ?? undefined,
        productSnapshot: {
          nameFr: snapshot.nameFr ?? 'Licence',
          nameEn: snapshot.nameEn ?? 'License',
          slug: snapshot.slug ?? 'unknown',
        },
      };
    });

    const generated = await this.licenseService.generateForOrder(order.id, items);
    this.logger.log(
      `Generated ${generated.length} license(s) for order ${order.id} (userId=${order.userId ?? 'guest'})`,
    );
  }

  private async handlePaymentIntentFailed(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.id as string;
    const lastPaymentError = data.last_payment_error as Record<string, unknown> | undefined;

    this.logger.warn(`Payment Intent failed: ${paymentIntentId}`);

    // Emit event for Order Service to cancel the order and release stock
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, {
      paymentIntentId,
      error: (lastPaymentError?.message as string) || 'Payment failed',
    });
  }

  private async handleInvoicePaid(data: Record<string, unknown>): Promise<void> {
    const subscriptionId = data.subscription as string | undefined;
    if (!subscriptionId) return;

    this.logger.log(`Invoice paid for subscription: ${subscriptionId}`);

    // Update subscription period
    const subscription = await this.subscriptionService.findByStripeId(subscriptionId);
    if (subscription) {
      const lines = data.lines as Record<string, unknown> | undefined;
      const linesData = (lines?.data as Array<Record<string, unknown>>) || [];
      const period = linesData[0]?.period as Record<string, number> | undefined;
      const periodEnd = period?.end;
      if (periodEnd) {
        subscription.currentPeriodEnd = new Date(periodEnd * 1000);
        await this.subscriptionService.create(subscription);
      }

      // Emit renewal event
      this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        productId: subscription.productId,
      });
    }
  }

  private async handleInvoicePaymentFailed(data: Record<string, unknown>): Promise<void> {
    const subscriptionId = data.subscription as string | undefined;
    if (!subscriptionId) return;

    this.logger.warn(`Invoice payment failed for subscription: ${subscriptionId}`);

    // Update subscription status to PAST_DUE
    await this.subscriptionService.updateStatus(subscriptionId, SubscriptionStatus.PAST_DUE);

    // Emit event for notification
    const subscription = await this.subscriptionService.findByStripeId(subscriptionId);
    if (subscription) {
      this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        productId: subscription.productId,
      });
    }
  }

  private async handleSubscriptionCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription created on Stripe: ${data.id}`);

    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED, {
      stripeSubscriptionId: data.id as string,
      customerId: data.customer as string,
    });
  }

  private async handleSubscriptionUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription updated on Stripe: ${data.id}`);

    // Sync local state from Stripe
    try {
      await this.subscriptionService.syncFromStripe(data as unknown as Stripe.Subscription);
    } catch (error) {
      this.logger.warn(
        `Could not sync subscription ${data.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async handleSubscriptionDeleted(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription deleted on Stripe: ${data.id}`);

    const subscription = await this.subscriptionService.findByStripeId(data.id as string);
    if (subscription) {
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.endedAt = new Date();
      await this.subscriptionService.create(subscription);

      // Emit cancellation event
      this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        productId: subscription.productId,
      });
    }
  }

  private async handleChargeRefunded(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.payment_intent as string;

    this.logger.log(`Charge refunded for payment intent: ${paymentIntentId}`);

    // Emit refund event for Order Service
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, {
      paymentIntentId,
      chargeId: data.id as string,
      amount: data.amount_refunded as number,
    });
  }
}
