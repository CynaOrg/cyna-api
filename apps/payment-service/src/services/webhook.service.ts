import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, EVENT_PATTERNS, SubscriptionStatus } from '@cyna-api/common';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SubscriptionService } from './subscription.service';
import { LicenseService } from './license.service';
import { WebhookPayloadDto } from '../dto/webhook-payload.dto';

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

  private async handlePaymentIntentSucceeded(data: any): Promise<void> {
    const paymentIntentId = data.id;
    const amount = data.amount;
    const metadata = data.metadata || {};

    this.logger.log(`Payment Intent succeeded: ${paymentIntentId}`);

    // Emit event for Order Service to confirm the order
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });

    // Emit event for Notification Service
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });
  }

  private async handlePaymentIntentFailed(data: any): Promise<void> {
    const paymentIntentId = data.id;
    const lastPaymentError = data.last_payment_error;

    this.logger.warn(`Payment Intent failed: ${paymentIntentId}`);

    // Emit event for Order Service to cancel the order and release stock
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, {
      paymentIntentId,
      error: lastPaymentError?.message || 'Payment failed',
    });
  }

  private async handleInvoicePaid(data: any): Promise<void> {
    const subscriptionId = data.subscription;
    if (!subscriptionId) return;

    this.logger.log(`Invoice paid for subscription: ${subscriptionId}`);

    // Update subscription period
    const subscription = await this.subscriptionService.findByStripeId(subscriptionId);
    if (subscription) {
      const periodEnd = data.lines?.data?.[0]?.period?.end;
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

  private async handleInvoicePaymentFailed(data: any): Promise<void> {
    const subscriptionId = data.subscription;
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

  private async handleSubscriptionCreated(data: any): Promise<void> {
    this.logger.log(`Subscription created on Stripe: ${data.id}`);

    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED, {
      stripeSubscriptionId: data.id,
      customerId: data.customer,
    });
  }

  private async handleSubscriptionUpdated(data: any): Promise<void> {
    this.logger.log(`Subscription updated on Stripe: ${data.id}`);

    // Sync local state from Stripe
    try {
      await this.subscriptionService.syncFromStripe(data);
    } catch (error) {
      this.logger.warn(
        `Could not sync subscription ${data.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async handleSubscriptionDeleted(data: any): Promise<void> {
    this.logger.log(`Subscription deleted on Stripe: ${data.id}`);

    const subscription = await this.subscriptionService.findByStripeId(data.id);
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

  private async handleChargeRefunded(data: any): Promise<void> {
    const paymentIntentId = data.payment_intent;

    this.logger.log(`Charge refunded for payment intent: ${paymentIntentId}`);

    // Emit refund event for Order Service
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, {
      paymentIntentId,
      chargeId: data.id,
      amount: data.amount_refunded,
    });
  }
}
