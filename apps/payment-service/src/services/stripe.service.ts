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
      apiVersion: '2026-02-25.clover',
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
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
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

  /**
   * Create a Stripe Product plus its recurring Prices (monthly and/or yearly)
   * from a SaaS catalog entry. Used by `catalog-service` when an admin saves a
   * new SaaS so the front can subscribe to it without manual Stripe Dashboard
   * setup. Amounts must be HT in major units (e.g. 99.00 EUR), converted to
   * minor units (cents) for Stripe.
   */
  async createProductWithPrices(input: {
    name: string;
    description?: string;
    currency: string;
    priceMonthly?: number | null;
    priceYearly?: number | null;
    metadata?: Record<string, string>;
  }): Promise<{
    stripeProductId: string;
    stripePriceIdMonthly: string | null;
    stripePriceIdYearly: string | null;
  }> {
    const product = await this.stripe.products.create({
      name: input.name,
      description: input.description?.slice(0, 350) || undefined,
      metadata: input.metadata,
    });

    const currency = input.currency.toLowerCase();

    const stripePriceIdMonthly = input.priceMonthly
      ? (
          await this.stripe.prices.create({
            product: product.id,
            unit_amount: Math.round(input.priceMonthly * 100),
            currency,
            recurring: { interval: 'month' },
            metadata: input.metadata,
          })
        ).id
      : null;

    const stripePriceIdYearly = input.priceYearly
      ? (
          await this.stripe.prices.create({
            product: product.id,
            unit_amount: Math.round(input.priceYearly * 100),
            currency,
            recurring: { interval: 'year' },
            metadata: input.metadata,
          })
        ).id
      : null;

    return { stripeProductId: product.id, stripePriceIdMonthly, stripePriceIdYearly };
  }

  /**
   * Stripe Prices are immutable, so editing a SaaS price means archiving the
   * old Price (`active: false`) and creating a new one on the same Product.
   * Existing Subscriptions stay attached to the old Price (their billing does
   * not change — by design), new subscriptions use the new id.
   */
  async replacePrice(input: {
    stripeProductId: string;
    oldPriceId?: string | null;
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    metadata?: Record<string, string>;
  }): Promise<string> {
    if (input.oldPriceId) {
      try {
        await this.stripe.prices.update(input.oldPriceId, { active: false });
      } catch (err) {
        this.logger.warn(
          `Failed to archive old Stripe price ${input.oldPriceId}: ${(err as Error).message}`,
        );
      }
    }
    const newPrice = await this.stripe.prices.create({
      product: input.stripeProductId,
      unit_amount: Math.round(input.amount * 100),
      currency: input.currency.toLowerCase(),
      recurring: { interval: input.interval },
      metadata: input.metadata,
    });
    return newPrice.id;
  }

  /**
   * Update mutable fields on an existing Stripe Product (name + description).
   * Prices are never modified here — see `replacePrice` for that.
   */
  async updateProductMetadata(
    stripeProductId: string,
    input: { name?: string; description?: string },
  ): Promise<void> {
    const params: Stripe.ProductUpdateParams = {};
    if (input.name) params.name = input.name;
    if (input.description !== undefined) {
      params.description = input.description?.slice(0, 350) || null;
    }
    if (Object.keys(params).length === 0) return;
    await this.stripe.products.update(stripeProductId, params);
  }

  /**
   * Archive a Stripe Product (Stripe does not allow hard deletes for products
   * that have ever been charged). Existing subscriptions keep running on their
   * Prices — Stripe documents this is safe. Used when the catalog admin deletes
   * a SaaS entry.
   */
  async archiveProduct(stripeProductId: string): Promise<void> {
    await this.stripe.products.update(stripeProductId, { active: false });
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

    // Stripe 2026-01-28.clover no longer sweeps pending invoice items into a
    // newly-created invoice by default — previously this produced a 0-EUR
    // draft that auto-settled and orphaned our real line items. We create the
    // draft FIRST and then attach each item explicitly via `invoice: draft.id`.
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

    for (const item of input.items) {
      const amountHtCents = Math.round(item.unitPriceHt * item.quantity * 100);
      await this.stripe.invoiceItems.create({
        customer: input.customerId,
        invoice: draft.id,
        currency,
        amount: amountHtCents,
        description: `${item.description} × ${item.quantity}`,
        tax_rates: [taxRateId],
        metadata: input.metadata,
      });
    }
    const finalized = await this.stripe.invoices.finalizeInvoice(draft.id);
    if (!finalized.id) throw new Error('Stripe finalized invoice missing id');
    // When the customer has a recent payment on file, Stripe can auto-apply
    // the balance and the invoice transitions straight to "paid" during
    // finalize — calling .pay() on an already-paid invoice throws
    // `Invoice is already paid`. Skip the out-of-band pay in that case.
    if (finalized.status === 'paid') return finalized;
    try {
      return await this.stripe.invoices.pay(finalized.id, { paid_out_of_band: true });
    } catch (err: unknown) {
      // Defensive: if Stripe flipped the invoice to paid between finalize and
      // pay (race), re-read it so we still return a paid invoice with URL.
      const message = err instanceof Error ? err.message : String(err);
      if (/already.*paid/i.test(message)) {
        this.logger.log(`Invoice ${finalized.id} was already paid; returning current state`);
        return this.stripe.invoices.retrieve(finalized.id);
      }
      throw err;
    }
  }

  async listActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    return subscriptions.data;
  }
}
