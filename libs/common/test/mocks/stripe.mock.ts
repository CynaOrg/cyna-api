export const createMockStripe = () => ({
  customers: {
    create: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    update: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    del: jest.fn().mockResolvedValue({ id: 'cus_test_123', deleted: true }),
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
      status: 'requires_payment_method',
    }),
    retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
    confirm: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
    cancel: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'canceled' }),
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_test_123',
      status: 'active',
      items: { data: [{ id: 'si_test_123', price: { id: 'price_test_123' } }] },
      latest_invoice: { id: 'in_test_123', payment_intent: { client_secret: 'pi_secret' } },
    }),
    retrieve: jest.fn().mockResolvedValue({ id: 'sub_test_123', status: 'active' }),
    update: jest.fn().mockResolvedValue({ id: 'sub_test_123', status: 'active' }),
    cancel: jest.fn().mockResolvedValue({ id: 'sub_test_123', status: 'canceled' }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
  prices: {
    create: jest.fn().mockResolvedValue({ id: 'price_test_123' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'price_test_123', unit_amount: 1000 }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
  products: {
    create: jest.fn().mockResolvedValue({ id: 'prod_test_123' }),
    update: jest.fn().mockResolvedValue({ id: 'prod_test_123' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'prod_test_123' }),
  },
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/test',
      }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cs_test_123', payment_status: 'paid' }),
    },
  },
  invoices: {
    retrieve: jest.fn().mockResolvedValue({ id: 'in_test_123', status: 'paid' }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
  refunds: {
    create: jest.fn().mockResolvedValue({ id: 're_test_123', status: 'succeeded' }),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
});

export type MockStripe = ReturnType<typeof createMockStripe>;

export const buildStripeEvent = <T = Record<string, unknown>>(
  type: string,
  data: T,
  id = `evt_test_${Math.random().toString(36).slice(2, 10)}`,
) => ({
  id,
  type,
  data: { object: data },
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  api_version: '2026-01-28.clover',
  object: 'event',
});
