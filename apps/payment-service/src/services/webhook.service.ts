import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
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
  LicensesIssuedEvent,
  IssuedLicense as IssuedLicenseEvent,
} from '@cyna-api/common';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SubscriptionService } from './subscription.service';
import {
  LicenseService,
  OrderItemWithProduct,
  IssuedLicense as ServiceIssuedLicense,
} from './license.service';
import { StripeService } from './stripe.service';
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

interface OrderForLicenseGeneration {
  id: string;
  orderNumber?: string;
  userId: string | null;
  customerEmail: string;
  currency?: string;
  items: Array<{
    productId: string;
    productSnapshot: Record<string, unknown>;
    quantity: number;
    unitPrice?: number | string;
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
    private readonly stripeService: StripeService,
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Generate a real Stripe invoice (TVA-compliant, numbered, downloadable PDF)
   * for a successful one-shot PaymentIntent purchase. Requires the PI to carry
   * a `customer` — which PaymentService.createPaymentIntent guarantees since
   * the "real invoice" feature shipped. Gracefully falls back to the
   * charge.receipt_url if anything fails, so the confirmation email always
   * has SOME link to show.
   */
  private async resolveInvoiceForPurchase(
    data: Record<string, unknown>,
    order: OrderForLicenseGeneration,
  ): Promise<{ id: string | null; url: string | null }> {
    const paymentIntentId = data.id as string | undefined;
    if (!paymentIntentId) return { id: null, url: null };

    try {
      const pi = await this.stripeService.getPaymentIntentWithCharge(paymentIntentId);
      const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;

      if (customerId && order.items.length > 0) {
        const items = order.items
          .filter((it) => typeof it.unitPrice !== 'undefined')
          .map((it) => {
            const snapshot = it.productSnapshot as { nameFr?: string; nameEn?: string };
            return {
              description: snapshot.nameFr ?? snapshot.nameEn ?? 'Article',
              unitPriceHt: Number(it.unitPrice),
              quantity: it.quantity,
            };
          });
        if (items.length > 0) {
          const invoice = await this.stripeService.generateInvoiceForPurchase({
            customerId,
            currency: order.currency ?? 'EUR',
            items,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber ?? '',
              paymentIntentId,
            },
          });
          this.logger.log(
            `Generated Stripe invoice ${invoice.number ?? invoice.id} for order ${order.orderNumber ?? order.id}`,
          );
          // invoice_pdf is the direct PDF download URL (served with
          // Content-Disposition: attachment by Stripe) — preferred over
          // hosted_invoice_url so clicking the CTA immediately downloads
          // the document instead of opening the Stripe-hosted summary page.
          return {
            id: invoice.id ?? null,
            url: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null,
          };
        }
      }

      // Fallback: no customer on PI or no usable items — surface the charge
      // receipt URL so the email still has a link.
      const charge =
        typeof pi.latest_charge === 'object' && pi.latest_charge
          ? (pi.latest_charge as Stripe.Charge)
          : null;
      return { id: charge?.id ?? null, url: charge?.receipt_url ?? null };
    } catch (err) {
      this.logger.warn(
        `Could not generate/fetch invoice for ${paymentIntentId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
    return { id: null, url: null };
  }

  async handleWebhookEvent(payload: WebhookPayloadDto): Promise<void> {
    const { eventId, eventType, data } = payload;

    // 1. Claim the event atomically. Two concurrent deliveries of the same
    //    Stripe eventId (possible when the first delivery is slow and Stripe
    //    retries before markProcessed runs) race on the same PK insert; one
    //    wins, the loser short-circuits.
    const claimed = await this.tryClaimEvent(eventId, eventType);
    if (!claimed) {
      this.logger.log(`Webhook ${eventId} already claimed, skipping`);
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
    } catch (error) {
      // Release the claim so Stripe's retry can reprocess this eventId.
      await this.releaseClaim(eventId);
      this.logger.error(
        `Error processing webhook ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Attempt to atomically claim an event for processing.
   * Returns true if we won the race, false if another consumer already claimed it.
   */
  private async tryClaimEvent(eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.processedWebhookRepository.insert({
        eventId,
        eventType,
        processedAt: new Date(),
      });
      return true;
    } catch (err) {
      // Postgres unique_violation (23505) on the eventId PK means someone else claimed first.
      const code = (err as { code?: string }).code;
      if (code === '23505') return false;
      throw err;
    }
  }

  private async releaseClaim(eventId: string): Promise<void> {
    await this.processedWebhookRepository.delete({ eventId });
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
      const email = order.notificationEmail ?? order.customerEmail ?? '';
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

    // 1. Resolve order via order-service RPC so we can generate licenses.
    //    Runs BEFORE emitting PAYMENT.CONFIRMED: if license generation fails we want
    //    Stripe to retry the whole webhook, leaving the order status un-flipped until
    //    the system is fully consistent.
    const order = await this.fetchOrderByPaymentIntent(paymentIntentId);

    if (!order) {
      // The order may not have been persisted yet (eventual-consistency window on
      // the async UPDATE_ORDER_STATUS event that attaches stripePaymentIntentId).
      // Throw so Stripe retries the webhook — much safer than silently marking it
      // PAID with no license rows attached.
      throw new Error(
        `Order not found for payment intent ${paymentIntentId} — webhook will be retried`,
      );
    }

    const issued = await this.generateLicensesForOrder(order);

    // Generate a proper Stripe invoice (TVA-compliant, PDF downloadable) and
    // persist its URL on the Order so the detail page + confirmation email
    // can expose "Télécharger la facture".
    const invoice = await this.resolveInvoiceForPurchase(data, order);

    // 2. Emit event for Order Service to confirm the order + attach invoice.
    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
      stripeInvoiceId: invoice.id,
      stripeInvoiceUrl: invoice.url,
    });

    // 3. Enrich and emit to Notification Service with full order context
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
      invoiceUrl: invoice.url,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, event);

    if (issued.length > 0) {
      const licensesPayload: IssuedLicenseEvent[] = issued.map((i: ServiceIssuedLicense) => ({
        licenseId: i.license.id,
        licenseKey: i.license.licenseKey,
        productSnapshot: i.license.productSnapshot,
        activationToken: i.activationToken,
        activationExpiresAt: i.license.activationTokenExpiresAt?.toISOString() ?? '',
      }));
      const licensesEvent: LicensesIssuedEvent = {
        orderId: ctx.orderId,
        orderNumber: ctx.orderNumber,
        userId: ctx.userId,
        email: ctx.email,
        language: ctx.language,
        licenses: licensesPayload,
      };
      this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.LICENSES_ISSUED, licensesEvent);
    }
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

  private async generateLicensesForOrder(
    order: OrderForLicenseGeneration,
  ): Promise<ServiceIssuedLicense[]> {
    const licenseItems: OrderItemWithProduct[] = order.items
      .filter((item) => {
        const snapshot = item.productSnapshot as { productType?: string };
        return snapshot.productType === 'license';
      })
      .map((item) => {
        const snapshot = item.productSnapshot as {
          nameFr?: string;
          nameEn?: string;
          slug?: string;
          image?: string | null;
          productType?: string;
        };
        return {
          productId: item.productId,
          productType: 'license',
          quantity: item.quantity,
          email: order.customerEmail,
          userId: order.userId ?? undefined,
          productSnapshot: {
            nameFr: snapshot.nameFr ?? 'Licence',
            nameEn: snapshot.nameEn ?? 'License',
            slug: snapshot.slug ?? 'unknown',
            image: snapshot.image ?? null,
            productType: snapshot.productType ?? 'license',
          },
        };
      });

    if (licenseItems.length === 0) {
      this.logger.log(`Order ${order.id} has no license items — skipping generation`);
      return [];
    }

    // Idempotence guard: processed_webhooks dedupes same-eventId concurrent
    // deliveries, but a legitimate Stripe retry after markProcessed would still
    // reach here if we ever loosened that claim. Belt-and-suspenders.
    const existing = await this.licenseService.findByOrderId(order.id);
    if (existing.length > 0) {
      this.logger.log(
        `Licenses already generated for order ${order.id} (${existing.length} existing) — skipping`,
      );
      return [];
    }

    const generated = await this.licenseService.generateForOrder(order.id, licenseItems);
    this.logger.log(
      `Generated ${generated.length} license(s) for order ${order.id} (userId=${order.userId ?? 'guest'})`,
    );
    return generated;
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
    }

    // Invoice URLs live directly on the invoice webhook payload — no extra
    // fetch needed. Prefer invoice_pdf so clicking "Télécharger la facture"
    // triggers a direct PDF download.
    const invoiceUrl =
      (data.invoice_pdf as string | undefined) ??
      (data.hosted_invoice_url as string | undefined) ??
      null;
    if (invoiceUrl) {
      subscription.stripeLatestInvoiceUrl = invoiceUrl;
    }

    if (periodEnd || invoiceUrl) {
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
      invoiceUrl,
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
