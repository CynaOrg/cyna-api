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
    options: { receiptEmail?: string; customerId?: string } = {},
  ): Promise<Stripe.PaymentIntent> {
    const params: Stripe.PaymentIntentCreateParams = {
      amount,
      currency,
      payment_method_types: ['card'],
      metadata,
    };
    if (options.receiptEmail) params.receipt_email = options.receiptEmail;
    // Attaching a customer is what allows us to generate a proper Stripe
    // invoice (with number + TVA breakdown + PDF) in the succeeded webhook.
    if (options.customerId) params.customer = options.customerId;
    return this.stripe.paymentIntents.create(params);
  }

  async getPaymentIntentWithCharge(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
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

    const existing = await this.stripe.taxRates.list({ active: true, limit: 100 });
    const found = existing.data.find(
      (tr) => tr.percentage === 20 && tr.inclusive === false && tr.display_name === 'TVA',
    );

    if (found) {
      this.cachedTaxRateId = found.id;
      return found.id;
    }

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

  /**
   * Generate a real, tax-compliant Stripe invoice for a one-shot PaymentIntent
   * purchase that already succeeded. Pattern:
   *   1. Create one InvoiceItem per order line (HT amount + 20 % TVA tax rate)
   *   2. Create the invoice in draft (auto_advance=false to keep control)
   *   3. Finalize (assigns the Stripe invoice number; locks the invoice)
   *   4. Mark as paid out_of_band (payment already captured via the PI, so
   *      Stripe must not attempt to collect again)
   * Returns the paid invoice — `hosted_invoice_url` is the customer-facing
   * page with the "Download PDF" button; `invoice_pdf` is the direct PDF URL.
   */
  async generateInvoiceForPurchase(input: {
    customerId: string;
    currency: string;
    items: Array<{ description: string; unitPriceHt: number; quantity: number }>;
    metadata: Record<string, string>;
  }): Promise<Stripe.Invoice> {
    const taxRateId = await this.getOrCreateTaxRate();
    const currency = input.currency.toLowerCase();

    for (const item of input.items) {
      const amountHtCents = Math.round(item.unitPriceHt * item.quantity * 100);
      await this.stripe.invoiceItems.create({
        customer: input.customerId,
        currency,
        amount: amountHtCents,
        description: `${item.description} × ${item.quantity}`,
        tax_rates: [taxRateId],
        metadata: input.metadata,
      });
    }

    const draft = await this.stripe.invoices.create({
      customer: input.customerId,
      // send_invoice + days_until_due=0 prevents Stripe from auto-charging
      // the customer on finalize; combined with auto_advance=false it stays
      // paused until we explicitly pay out_of_band.
      collection_method: 'send_invoice',
      days_until_due: 0,
      auto_advance: false,
      currency,
      metadata: input.metadata,
    });
    if (!draft.id) throw new Error('Stripe draft invoice missing id');
    const finalized = await this.stripe.invoices.finalizeInvoice(draft.id);
    if (!finalized.id) throw new Error('Stripe finalized invoice missing id');
    return this.stripe.invoices.pay(finalized.id, { paid_out_of_band: true });
  }

  async listActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    return subscriptions.data;
  }
}
