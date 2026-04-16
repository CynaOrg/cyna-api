import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  EVENT_PATTERNS,
  Language,
  coerceLanguage,
  translateStripeDecline,
  SubscriptionStatus,
  PaymentConfirmedEvent,
  PaymentFailedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionPastDueEvent,
  SubscriptionCancelledEvent,
  RefundedEvent,
} from '@cyna-api/common';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SubscriptionService } from './subscription.service';
import { LicenseService } from './license.service';
import { WebhookPayloadDto } from '../dto/webhook-payload.dto';
import Stripe from 'stripe';

interface OrderNotificationContext {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  total: number;
  currency: string;
  itemsSummary: string;
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

  private async resolveOrderByPaymentIntent(
    paymentIntentId: string,
  ): Promise<OrderNotificationContext | null> {
    try {
      const order = await firstValueFrom(
        this.orderClient
          .send(MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT, { paymentIntentId })
          .pipe(
            timeout(3000),
            catchError((err) => throwError(() => err)),
          ),
      );
      if (!order) return null;
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsSummary = items
        .map((it: { productSnapshot?: { name?: string; nameEn?: string }; quantity?: number }) => {
          const name = it.productSnapshot?.name ?? it.productSnapshot?.nameEn ?? 'Item';
          return `${name} x${it.quantity ?? 1}`;
        })
        .join(', ');
      const email = order.notificationEmail ?? order.guestEmail ?? '';
      const language = coerceLanguage(order.notificationLanguage);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId ?? null,
        email,
        language,
        total: Number(order.total ?? 0),
        currency: order.currency ?? 'EUR',
        itemsSummary,
      };
    } catch (err) {
      this.logger.error(
        `Failed to resolve order for notification: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async handlePaymentIntentSucceeded(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.id as string;
    const amount = data.amount as number;
    const metadata = (data.metadata as Record<string, unknown>) || {};

    this.logger.log(`Payment Intent succeeded: ${paymentIntentId}`);

    // Emit event for Order Service to confirm the order
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });

    // Enrich and emit to Notification Service
    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) {
      this.logger.warn(`Skipping notification for paymentIntent: order or email missing`);
      return;
    }

    const event: PaymentConfirmedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      total: ctx.total,
      currency: ctx.currency,
      itemsSummary: ctx.itemsSummary,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, event);
  }

  private async handlePaymentIntentFailed(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.id as string;
    const lastPaymentError = data.last_payment_error as Record<string, unknown> | undefined;
    const rawMessage = (lastPaymentError?.message as string) || 'Payment failed';
    const declineCode = (lastPaymentError?.decline_code as string | undefined) ?? null;

    this.logger.warn(`Payment Intent failed: ${paymentIntentId} (decline_code=${declineCode})`);

    // Emit event for Order Service to cancel the order and release stock.
    // Internal consumers keep the raw Stripe message for diagnostics.
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, {
      paymentIntentId,
      error: rawMessage,
    });

    // Enrich and emit to Notification Service
    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) {
      this.logger.warn(`Skipping failure notification: order or email missing`);
      return;
    }

    // Send a curated bilingual message to the customer instead of the raw
    // Stripe/issuer-controlled string, which can leak metadata or contain
    // arbitrary text from the card issuer.
    const customerMessage = translateStripeDecline(declineCode, ctx.language);

    const event: PaymentFailedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      error: customerMessage,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, event);
  }

  private async handleInvoicePaid(data: Record<string, unknown>): Promise<void> {
    const subscriptionId = data.subscription as string | undefined;
    if (!subscriptionId) return;

    this.logger.log(`Invoice paid for subscription: ${subscriptionId}`);

    // Update subscription period
    const subscription = await this.subscriptionService.findByStripeId(subscriptionId);
    if (!subscription) return;

    const lines = data.lines as Record<string, unknown> | undefined;
    const linesData = (lines?.data as Array<Record<string, unknown>>) || [];
    const period = linesData[0]?.period as Record<string, number> | undefined;
    const periodEnd = period?.end;
    if (periodEnd) {
      subscription.currentPeriodEnd = new Date(periodEnd * 1000);
      await this.subscriptionService.create(subscription);
    }

    if (!subscription.notificationEmail) {
      this.logger.warn(
        `Skipping renewal email for subscription ${subscription.id}: notificationEmail missing`,
      );
      return;
    }

    const event: SubscriptionRenewedEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
      newPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? '',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED, event);
  }

  private async handleInvoicePaymentFailed(data: Record<string, unknown>): Promise<void> {
    const subscriptionId = data.subscription as string | undefined;
    if (!subscriptionId) return;

    this.logger.warn(`Invoice payment failed for subscription: ${subscriptionId}`);

    await this.subscriptionService.updateStatus(subscriptionId, SubscriptionStatus.PAST_DUE);

    const subscription = await this.subscriptionService.findByStripeId(subscriptionId);
    if (!subscription || !subscription.notificationEmail) return;

    const event: SubscriptionPastDueEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE, event);
  }

  private async handleSubscriptionCreated(data: Record<string, unknown>): Promise<void> {
    const stripeSubId = data.id as string;
    this.logger.log(`Subscription created on Stripe: ${stripeSubId}`);

    const subscription = await this.subscriptionService.findByStripeId(stripeSubId);
    if (!subscription) {
      this.logger.warn(
        `Subscription not found for stripeId=${stripeSubId} (race with createSubscription save)`,
      );
      return;
    }

    if (!subscription.notificationEmail) return;

    const items = data.items as Record<string, unknown> | undefined;
    const itemsData = (items?.data as Array<Record<string, unknown>>) || [];
    const firstItem = itemsData[0];
    const price = firstItem?.price as Record<string, unknown> | undefined;
    const unitAmount = (price?.unit_amount as number | null) ?? 0;
    const currency = ((price?.currency as string | undefined) ?? 'EUR').toUpperCase();
    const recurring = price?.recurring as Record<string, unknown> | undefined;
    const billingPeriod = recurring?.interval === 'year' ? 'yearly' : 'monthly';

    const event: SubscriptionCreatedEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
      billingPeriod,
      price: unitAmount / 100,
      currency,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED, event);
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
    if (!subscription) return;

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.endedAt = new Date();
    await this.subscriptionService.create(subscription);

    if (!subscription.notificationEmail) return;

    const event: SubscriptionCancelledEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED, event);
  }

  private async handleChargeRefunded(data: Record<string, unknown>): Promise<void> {
    const paymentIntentId = data.payment_intent as string;
    const amountRefunded = (data.amount_refunded as number) ?? 0;
    const currency = ((data.currency as string | undefined) ?? 'EUR').toUpperCase();
    const refundAmount = amountRefunded / 100;

    this.logger.log(`Charge refunded for payment intent: ${paymentIntentId}`);

    // Emit refund event for Order Service
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, {
      paymentIntentId,
      chargeId: data.id as string,
      amount: amountRefunded,
    });

    // Enrich and emit to Notification Service
    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) return;

    const event: RefundedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      refundAmount,
      currency,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, event);
  }
}
