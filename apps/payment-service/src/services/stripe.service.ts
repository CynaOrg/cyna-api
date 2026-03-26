import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY', '');
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card'],
      metadata,
    });
  }

  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      name,
      metadata,
    });
  }

  async createSubscription(
    customerId: string,
    priceId: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    const taxRateId = await this.getOrCreateTaxRate();
    return this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_tax_rates: [taxRateId],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.confirmation_secret'],
      metadata,
    });
  }

  private cachedTaxRateId: string | null = null;

  private async getOrCreateTaxRate(): Promise<string> {
    if (this.cachedTaxRateId) return this.cachedTaxRateId;

    // Look for an existing active 20% VAT tax rate
    const existing = await this.stripe.taxRates.list({ active: true, limit: 100 });
    const found = existing.data.find(
      (tr) => tr.percentage === 20 && tr.inclusive === false && tr.display_name === 'TVA',
    );

    if (found) {
      this.cachedTaxRateId = found.id;
      return found.id;
    }

    // Create a new one
    const taxRate = await this.stripe.taxRates.create({
      display_name: 'TVA',
      description: 'TVA France 20%',
      percentage: 20,
      inclusive: false,
      jurisdiction: 'FR',
    });

    this.cachedTaxRateId = taxRate.id;
    return taxRate.id;
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<Stripe.Subscription> {
    if (cancelAtPeriodEnd) {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, params);
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.retrieve(invoiceId);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async listActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    return subscriptions.data;
  }
}
