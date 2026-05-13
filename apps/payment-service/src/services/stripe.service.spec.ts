import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

// We mock the Stripe constructor entirely. Jest hoists the mock factory, so we
// keep a hoist-safe reference and grab the inner `mockStripe` after import.
type MockStripe = {
  customers: {
    create: jest.Mock;
    retrieve: jest.Mock;
    update: jest.Mock;
    del: jest.Mock;
  };
  paymentIntents: {
    create: jest.Mock;
    retrieve: jest.Mock;
    confirm: jest.Mock;
    cancel: jest.Mock;
  };
  subscriptions: {
    create: jest.Mock;
    retrieve: jest.Mock;
    update: jest.Mock;
    cancel: jest.Mock;
    list: jest.Mock;
  };
  invoices: {
    create: jest.Mock;
    retrieve: jest.Mock;
    finalizeInvoice: jest.Mock;
    pay: jest.Mock;
    list: jest.Mock;
  };
  invoiceItems: { create: jest.Mock };
  taxRates: { list: jest.Mock; create: jest.Mock };
  webhooks: { constructEvent: jest.Mock };
};

const mockStripe: MockStripe = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    del: jest.fn(),
  },
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    list: jest.fn(),
  },
  invoices: {
    create: jest.fn(),
    retrieve: jest.fn(),
    finalizeInvoice: jest.fn(),
    pay: jest.fn(),
    list: jest.fn(),
  },
  invoiceItems: { create: jest.fn() },
  taxRates: { list: jest.fn(), create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};

jest.mock('stripe', () => {
  class FakeStripeSignatureError extends Error {
    type = 'StripeSignatureVerificationError';
  }
  const ctor = jest.fn().mockImplementation(() => mockStripe);
  (ctor as unknown as { errors: Record<string, unknown> }).errors = {
    StripeSignatureVerificationError: FakeStripeSignatureError,
  };
  return { __esModule: true, default: ctor };
});

// Retrieved post-import for use in tests.

const StripeMockedModule = jest.requireMock('stripe') as {
  default: { errors: { StripeSignatureVerificationError: new (msg: string) => Error } };
};
const FakeStripeSignatureError = StripeMockedModule.default.errors.StripeSignatureVerificationError;

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    // Reset all stripe mocks between tests so cached state (e.g. tax rate)
    // does not leak across describe blocks.
    Object.values(mockStripe).forEach((group) => {
      Object.values(group).forEach((fn) => (fn as jest.Mock).mockReset());
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk_test_dummy') },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  describe('createCustomer', () => {
    it('creates a customer with email + name + metadata', async () => {
      mockStripe.customers.create.mockResolvedValueOnce({ id: 'cus_new' });

      const result = await service.createCustomer('a@b.com', 'Alice', { userId: 'u-1' });

      expect(result).toEqual({ id: 'cus_new' });
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'a@b.com',
        name: 'Alice',
        metadata: { userId: 'u-1' },
      });
    });

    it('omits metadata when not provided', async () => {
      mockStripe.customers.create.mockResolvedValueOnce({ id: 'cus_x' });

      await service.createCustomer('a@b.com', 'Alice');

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'a@b.com',
        name: 'Alice',
        metadata: undefined,
      });
    });

    it('propagates Stripe API errors', async () => {
      mockStripe.customers.create.mockRejectedValueOnce(new Error('Stripe API down'));

      await expect(service.createCustomer('a@b.com', 'Alice')).rejects.toThrow('Stripe API down');
    });
  });

  describe('createPaymentIntent', () => {
    it('creates a PaymentIntent with mandatory automatic_payment_methods', async () => {
      mockStripe.paymentIntents.create.mockResolvedValueOnce({
        id: 'pi_1',
        client_secret: 'pi_1_secret',
      });

      const result = await service.createPaymentIntent(2500, 'eur', { orderId: 'o-1' });

      expect(result).toEqual({ id: 'pi_1', client_secret: 'pi_1_secret' });
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2500,
        currency: 'eur',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { orderId: 'o-1' },
      });
    });

    it('attaches receipt_email and customer when provided', async () => {
      mockStripe.paymentIntents.create.mockResolvedValueOnce({ id: 'pi_2' });

      await service.createPaymentIntent(
        1000,
        'eur',
        { orderId: 'o-2' },
        { receiptEmail: 'g@guest.com', customerId: 'cus_g' },
      );

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          receipt_email: 'g@guest.com',
          customer: 'cus_g',
        }),
      );
    });

    it('does NOT attach customer/receipt_email when not provided (anonymous PI)', async () => {
      mockStripe.paymentIntents.create.mockResolvedValueOnce({ id: 'pi_3' });

      await service.createPaymentIntent(500, 'usd', { orderId: 'o-3' });

      const callArg = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('customer');
      expect(callArg).not.toHaveProperty('receipt_email');
    });

    it('propagates Stripe API failure', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce(new Error('rate_limit'));
      await expect(service.createPaymentIntent(100, 'eur', { orderId: 'o' })).rejects.toThrow(
        'rate_limit',
      );
    });
  });

  describe('getPaymentIntent / getPaymentIntentWithCharge', () => {
    it('retrieves a PI by id', async () => {
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_x' });

      const result = await service.getPaymentIntent('pi_x');

      expect(result).toEqual({ id: 'pi_x' });
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_x');
    });

    it('retrieves a PI expanded with latest_charge', async () => {
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_y',
        latest_charge: { id: 'ch_1' },
      });

      const result = await service.getPaymentIntentWithCharge('pi_y');

      expect(result.id).toBe('pi_y');
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_y', {
        expand: ['latest_charge'],
      });
    });

    it('propagates Stripe 404 when PI does not exist', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error('No such payment_intent'));
      await expect(service.getPaymentIntent('pi_missing')).rejects.toThrow(
        'No such payment_intent',
      );
    });
  });

  describe('createSubscription', () => {
    beforeEach(() => {
      // existing tax rate matches → no create call
      mockStripe.taxRates.list.mockResolvedValue({
        data: [{ id: 'txr_existing', percentage: 20, inclusive: false, display_name: 'TVA' }],
      });
      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_1',
        status: 'incomplete',
        latest_invoice: { id: 'in_1' },
      });
    });

    it('creates with default_incomplete payment_behavior and tax rate', async () => {
      const result = await service.createSubscription('cus_1', 'price_1', { userId: 'u-1' });

      expect(result.id).toBe('sub_1');
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_1',
        items: [{ price: 'price_1' }],
        default_tax_rates: ['txr_existing'],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.confirmation_secret'],
        metadata: { userId: 'u-1' },
      });
    });

    it('caches the tax rate across calls (only lists once)', async () => {
      await service.createSubscription('cus_1', 'price_1', {});
      await service.createSubscription('cus_2', 'price_2', {});

      expect(mockStripe.taxRates.list).toHaveBeenCalledTimes(1);
      expect(mockStripe.taxRates.create).not.toHaveBeenCalled();
    });

    it('creates a new tax rate when none matches', async () => {
      mockStripe.taxRates.list.mockResolvedValueOnce({ data: [] });
      mockStripe.taxRates.create.mockResolvedValueOnce({ id: 'txr_new' });

      await service.createSubscription('cus_1', 'price_1', {});

      expect(mockStripe.taxRates.create).toHaveBeenCalledWith({
        display_name: 'TVA',
        description: 'TVA France 20%',
        percentage: 20,
        inclusive: false,
        jurisdiction: 'FR',
      });
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ default_tax_rates: ['txr_new'] }),
      );
    });

    it('propagates Stripe failure when subscription create fails', async () => {
      mockStripe.subscriptions.create.mockRejectedValueOnce(new Error('Stripe down'));

      await expect(service.createSubscription('cus_1', 'price_1', {})).rejects.toThrow(
        'Stripe down',
      );
    });
  });

  describe('cancelSubscription', () => {
    it('updates cancel_at_period_end when flagged', async () => {
      mockStripe.subscriptions.update.mockResolvedValueOnce({
        id: 'sub_1',
        cancel_at_period_end: true,
      });

      const result = await service.cancelSubscription('sub_1', true);

      expect(result.cancel_at_period_end).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        cancel_at_period_end: true,
      });
      expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('immediately cancels when cancelAtPeriodEnd is false', async () => {
      mockStripe.subscriptions.cancel.mockResolvedValueOnce({ id: 'sub_1', status: 'canceled' });

      const result = await service.cancelSubscription('sub_1', false);

      expect(result.status).toBe('canceled');
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
    });
  });

  describe('updateSubscription / getSubscription / getInvoice', () => {
    it('forwards arbitrary update params to Stripe', async () => {
      mockStripe.subscriptions.update.mockResolvedValueOnce({ id: 'sub_1' });

      await service.updateSubscription('sub_1', { trial_end: 'now' });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { trial_end: 'now' });
    });

    it('retrieves a subscription by id', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_x' });

      const result = await service.getSubscription('sub_x');
      expect(result.id).toBe('sub_x');
    });

    it('retrieves an invoice by id', async () => {
      mockStripe.invoices.retrieve.mockResolvedValueOnce({ id: 'in_x' });

      const result = await service.getInvoice('in_x');
      expect(result.id).toBe('in_x');
    });
  });

  describe('constructWebhookEvent', () => {
    it('delegates to stripe.webhooks.constructEvent with the raw body', () => {
      const fakeEvent = { id: 'evt_1', type: 'payment_intent.succeeded' };
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(fakeEvent);

      const result = service.constructWebhookEvent(Buffer.from('raw'), 't=1,v1=abc', 'whsec_1');

      expect(result).toEqual(fakeEvent);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        Buffer.from('raw'),
        't=1,v1=abc',
        'whsec_1',
      );
    });

    // SECURITY: invalid signature MUST surface so the controller can return
    // 400. If this assertion ever fails silently, webhook forgery is possible.
    it('propagates StripeSignatureVerificationError on invalid signature', () => {
      mockStripe.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new FakeStripeSignatureError('bad signature');
      });

      expect(() => service.constructWebhookEvent(Buffer.from('raw'), 'bad', 'whsec_1')).toThrow(
        FakeStripeSignatureError,
      );
    });
  });

  describe('generateInvoiceForPurchase', () => {
    beforeEach(() => {
      mockStripe.taxRates.list.mockResolvedValue({
        data: [{ id: 'txr_1', percentage: 20, inclusive: false, display_name: 'TVA' }],
      });
      mockStripe.invoices.create.mockResolvedValue({ id: 'in_draft', status: 'draft' });
      mockStripe.invoiceItems.create.mockResolvedValue({ id: 'ii_1' });
      mockStripe.invoices.finalizeInvoice.mockResolvedValue({ id: 'in_draft', status: 'open' });
      mockStripe.invoices.pay.mockResolvedValue({
        id: 'in_draft',
        status: 'paid',
        hosted_invoice_url: 'https://stripe.test/i/abc',
      });
    });

    it('creates a draft + one item per line + finalize + pay out_of_band (happy path)', async () => {
      const result = await service.generateInvoiceForPurchase({
        customerId: 'cus_1',
        currency: 'EUR',
        items: [
          { description: 'SOC Pro', unitPriceHt: 49.99, quantity: 2 },
          { description: 'EDR', unitPriceHt: 100, quantity: 1 },
        ],
        metadata: { orderId: 'o-1' },
      });

      expect(result.status).toBe('paid');
      expect(mockStripe.invoices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_1',
          collection_method: 'send_invoice',
          days_until_due: 0,
          auto_advance: false,
          currency: 'eur',
        }),
      );
      // Two items
      expect(mockStripe.invoiceItems.create).toHaveBeenCalledTimes(2);
      // First item amount: 49.99 * 2 * 100 = 9998 cents
      expect(mockStripe.invoiceItems.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          amount: 9998,
          description: 'SOC Pro × 2',
          tax_rates: ['txr_1'],
          invoice: 'in_draft',
        }),
      );
      expect(mockStripe.invoices.finalizeInvoice).toHaveBeenCalledWith('in_draft');
      expect(mockStripe.invoices.pay).toHaveBeenCalledWith('in_draft', { paid_out_of_band: true });
    });

    it('skips pay() when finalize already returns status=paid', async () => {
      mockStripe.invoices.finalizeInvoice.mockResolvedValueOnce({
        id: 'in_already_paid',
        status: 'paid',
      });

      const result = await service.generateInvoiceForPurchase({
        customerId: 'cus_1',
        currency: 'eur',
        items: [{ description: 'X', unitPriceHt: 10, quantity: 1 }],
        metadata: {},
      });

      expect(result.status).toBe('paid');
      expect(mockStripe.invoices.pay).not.toHaveBeenCalled();
    });

    it('falls back to retrieve when pay() races with auto-paid invoice', async () => {
      mockStripe.invoices.pay.mockRejectedValueOnce(new Error('Invoice is already paid'));
      mockStripe.invoices.retrieve.mockResolvedValueOnce({
        id: 'in_draft',
        status: 'paid',
        hosted_invoice_url: 'https://stripe.test/i/abc',
      });

      const result = await service.generateInvoiceForPurchase({
        customerId: 'cus_1',
        currency: 'eur',
        items: [{ description: 'X', unitPriceHt: 10, quantity: 1 }],
        metadata: {},
      });

      expect(result.status).toBe('paid');
      expect(mockStripe.invoices.retrieve).toHaveBeenCalledWith('in_draft');
    });

    it('rethrows non-already-paid errors from pay()', async () => {
      mockStripe.invoices.pay.mockRejectedValueOnce(new Error('Card declined'));

      await expect(
        service.generateInvoiceForPurchase({
          customerId: 'cus_1',
          currency: 'eur',
          items: [{ description: 'X', unitPriceHt: 10, quantity: 1 }],
          metadata: {},
        }),
      ).rejects.toThrow('Card declined');
    });

    it('throws if draft has no id', async () => {
      mockStripe.invoices.create.mockResolvedValueOnce({ status: 'draft' }); // missing id

      await expect(
        service.generateInvoiceForPurchase({
          customerId: 'cus_1',
          currency: 'eur',
          items: [{ description: 'X', unitPriceHt: 10, quantity: 1 }],
          metadata: {},
        }),
      ).rejects.toThrow('Stripe draft invoice missing id');
    });

    it('throws if finalize returns no id', async () => {
      mockStripe.invoices.finalizeInvoice.mockResolvedValueOnce({ status: 'open' });

      await expect(
        service.generateInvoiceForPurchase({
          customerId: 'cus_1',
          currency: 'eur',
          items: [{ description: 'X', unitPriceHt: 10, quantity: 1 }],
          metadata: {},
        }),
      ).rejects.toThrow('Stripe finalized invoice missing id');
    });
  });

  describe('listActiveSubscriptions', () => {
    it('returns subscriptions data array filtered by status=active', async () => {
      mockStripe.subscriptions.list.mockResolvedValueOnce({
        data: [{ id: 'sub_a' }, { id: 'sub_b' }],
      });

      const result = await service.listActiveSubscriptions('cus_1');

      expect(result).toHaveLength(2);
      expect(mockStripe.subscriptions.list).toHaveBeenCalledWith({
        customer: 'cus_1',
        status: 'active',
      });
    });

    it('returns empty array when no subs', async () => {
      mockStripe.subscriptions.list.mockResolvedValueOnce({ data: [] });
      const result = await service.listActiveSubscriptions('cus_empty');
      expect(result).toEqual([]);
    });
  });
});
