import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { cleanDatabase } from '../helpers/db.helper';
import { loginUser } from '../helpers/auth.helper';
import {
  seedCategory,
  seedProduct,
  addToCart,
  resetSeedCounters,
  SeededProduct,
} from '../helpers/purchase.helper';
import { CartResponse, CheckoutResponse } from '../helpers/purchase.interfaces';
import { WebhookService } from '../../../payment-service/src/services/webhook.service';

interface LicenseKeyRow {
  id: string;
  order_id: string;
  product_id: string;
  user_id: string | null;
  license_key: string;
  email: string;
  status: string;
  product_snapshot: { nameFr: string; nameEn: string; slug: string };
}

describe('License Generation via Webhook (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let catalogDataSource: DataSource;
  let orderDataSource: DataSource;
  let paymentDataSource: DataSource;
  let paymentModule: TestingModule;
  let eventsSpy: MockAuthEventsPublisher;
  let webhookService: WebhookService;

  let licenseProduct: SeededProduct;

  const billingAddress = {
    firstName: 'License',
    lastName: 'Buyer',
    street: '10 rue des Licences',
    city: 'Paris',
    postalCode: '75001',
    country: 'FR',
  };

  beforeAll(async () => {
    const ctx = await setupTestApp({ useRealOrderClientInPayment: true });
    app = ctx.app;
    dataSource = ctx.dataSource;
    catalogDataSource = ctx.catalogDataSource;
    orderDataSource = ctx.orderDataSource;
    paymentDataSource = ctx.paymentDataSource;
    paymentModule = ctx.paymentModule;
    eventsSpy = ctx.eventsSpy;

    webhookService = paymentModule.get<WebhookService>(WebhookService);

    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    const category = await seedCategory(catalogDataSource, {
      slug: 'license-test-cat',
      nameFr: 'Licences',
      nameEn: 'Licenses',
    });

    licenseProduct = await seedProduct(catalogDataSource, category.id, {
      slug: 'license-test-product',
      nameFr: 'Antivirus Pro',
      nameEn: 'Antivirus Pro EN',
      productType: 'license',
      priceUnit: 49.99,
      priceMonthly: 49.99,
    });
  });

  afterAll(async () => {
    await cleanDatabase(catalogDataSource);
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    await cleanDatabase(orderDataSource);
    await cleanDatabase(paymentDataSource);
    eventsSpy.clear();
  });

  async function createOrder(opts: { quantity: number; email: string; accessToken?: string }) {
    const sessionId = opts.accessToken ? undefined : uuidv4();

    const cartRes = await addToCart(app, licenseProduct.id, {
      accessToken: opts.accessToken,
      sessionId,
      quantity: opts.quantity,
    });
    const cartBody = cartRes.body as CartResponse;

    const checkoutReq = request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .send({ cartId: cartBody.data.id, billingAddress, email: opts.email });

    if (opts.accessToken) {
      checkoutReq.set('Authorization', `Bearer ${opts.accessToken}`);
    } else if (sessionId) {
      checkoutReq.set('X-Session-Id', sessionId);
    }

    const checkoutRes = await checkoutReq;
    expect(checkoutRes.status).toBe(201);
    const checkout = checkoutRes.body as CheckoutResponse;

    // The gateway emits UPDATE_ORDER_STATUS asynchronously to attach stripePaymentIntentId
    // to the order. Wait for it to land in the DB before invoking the webhook.
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      orderId: checkout.data.orderId,
      paymentIntentId: checkout.data.paymentIntentId,
      amount: checkout.data.amount,
    };
  }

  async function invokeWebhook(paymentIntentId: string, amount: number, eventId: string) {
    await webhookService.handleWebhookEvent({
      eventId,
      eventType: 'payment_intent.succeeded',
      data: { id: paymentIntentId, amount, metadata: {} },
      created: Date.now(),
    });
  }

  async function getLicensesByOrderId(orderId: string): Promise<LicenseKeyRow[]> {
    return paymentDataSource.query(
      'SELECT * FROM license_keys WHERE order_id = $1 ORDER BY created_at ASC',
      [orderId],
    );
  }

  it('should generate one license per quantity for a logged-in user order', async () => {
    const email = `buyer-${Date.now()}@example.com`;
    const { accessToken, userId } = await loginUser(app, dataSource, eventsSpy, { email });

    const { orderId, paymentIntentId, amount } = await createOrder({
      quantity: 3,
      email,
      accessToken,
    });

    await invokeWebhook(paymentIntentId, amount, `evt_user_${Date.now()}`);

    const licenses = await getLicensesByOrderId(orderId);
    expect(licenses).toHaveLength(3);

    for (const license of licenses) {
      expect(license.product_id).toBe(licenseProduct.id);
      expect(license.user_id).toBe(userId);
      expect(license.email).toBe(email);
      expect(license.status).toBe('active');
      expect(license.license_key).toMatch(/^CYNA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(license.product_snapshot.nameFr).toBe('Antivirus Pro');
      expect(license.product_snapshot.nameEn).toBe('Antivirus Pro EN');
      expect(license.product_snapshot.slug).toBe('license-test-product');
    }

    // Keys are unique
    const keys = licenses.map((l) => l.license_key);
    expect(new Set(keys).size).toBe(3);
  });

  it('should generate a license for a guest order (no userId)', async () => {
    const email = `guest-${Date.now()}@example.com`;

    const { orderId, paymentIntentId, amount } = await createOrder({ quantity: 1, email });

    await invokeWebhook(paymentIntentId, amount, `evt_guest_${Date.now()}`);

    const licenses = await getLicensesByOrderId(orderId);
    expect(licenses).toHaveLength(1);
    expect(licenses[0].user_id).toBeNull();
    expect(licenses[0].email).toBe(email);
    expect(licenses[0].status).toBe('active');
  });

  it('should be idempotent when the same webhook eventId is replayed', async () => {
    const email = `replay-${Date.now()}@example.com`;
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, { email });

    const { orderId, paymentIntentId, amount } = await createOrder({
      quantity: 2,
      email,
      accessToken,
    });

    const eventId = `evt_replay_${Date.now()}`;
    await invokeWebhook(paymentIntentId, amount, eventId);
    await invokeWebhook(paymentIntentId, amount, eventId);

    const licenses = await getLicensesByOrderId(orderId);
    expect(licenses).toHaveLength(2);
  });

  it('should skip license generation on a retry with a different eventId (findByOrderId guard)', async () => {
    const email = `retry-${Date.now()}@example.com`;
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, { email });

    const { orderId, paymentIntentId, amount } = await createOrder({
      quantity: 2,
      email,
      accessToken,
    });

    await invokeWebhook(paymentIntentId, amount, `evt_first_${Date.now()}`);
    await invokeWebhook(paymentIntentId, amount, `evt_second_${Date.now()}`);

    const licenses = await getLicensesByOrderId(orderId);
    expect(licenses).toHaveLength(2);
  });

  it('should not create licenses when no order matches the payment intent', async () => {
    await invokeWebhook('pi_no_such_intent', 100, `evt_orphan_${Date.now()}`);

    const licenses = await paymentDataSource.query('SELECT COUNT(*)::int AS n FROM license_keys');
    expect(licenses[0].n).toBe(0);
  });
});
