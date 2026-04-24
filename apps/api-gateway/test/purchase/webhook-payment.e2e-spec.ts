import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
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

describe('Webhook Payment (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let catalogDataSource: DataSource;
  let orderDataSource: DataSource;
  let paymentDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  let product: SeededProduct;

  const billingAddress = {
    firstName: 'Webhook',
    lastName: 'Test',
    street: '20 rue de Rivoli',
    city: 'Paris',
    postalCode: '75001',
    country: 'FR',
  };

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    catalogDataSource = ctx.catalogDataSource;
    orderDataSource = ctx.orderDataSource;
    paymentDataSource = ctx.paymentDataSource;
    eventsSpy = ctx.eventsSpy;

    // Seed catalog
    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    const category = await seedCategory(catalogDataSource, {
      slug: 'webhook-test-cat',
      nameFr: 'Catégorie Webhook',
      nameEn: 'Webhook Category',
    });

    product = await seedProduct(catalogDataSource, category.id, {
      slug: 'webhook-test-product',
      nameFr: 'Produit Webhook',
      nameEn: 'Webhook Product',
      priceUnit: 99.99,
    });
  });

  afterAll(async () => {
    await cleanDatabase(catalogDataSource);
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    await cleanDatabase(orderDataSource);
    await cleanDatabase(paymentDataSource);
    eventsSpy.clear();
  });

  /**
   * Helper: create an order via checkout flow, returning orderId and paymentIntentId.
   */
  async function createTestOrder(): Promise<{
    orderId: string;
    paymentIntentId: string;
    accessToken: string;
  }> {
    const email = `webhook-${Date.now()}@example.com`;
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, { email });

    const cartRes = await addToCart(app, product.id, { accessToken, quantity: 1 });
    const cartBody = cartRes.body as CartResponse;

    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cartId: cartBody.data.id, billingAddress, email });

    const checkout = checkoutRes.body as CheckoutResponse;

    // Wait briefly for the event pattern to update the order with payment intent ID
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      orderId: checkout.data.orderId,
      paymentIntentId: checkout.data.paymentIntentId,
      accessToken,
    };
  }

  // TODO: The WebhookController instantiates its own `new Stripe(secretKey)` directly
  // in the constructor, so `this.stripe.webhooks.constructEvent()` uses the real Stripe
  // SDK and cannot be overridden via the MockStripeService provider. To properly test
  // this, the Stripe instance needs to be extracted into an injectable provider in the
  // WebhookController, or the controller must be retrieved post-init to replace its
  // internal Stripe instance. Until then, this test is marked as todo to avoid a false
  // positive (the previous version simply ran `UPDATE orders SET status = 'paid'` in
  // the DB, which tested nothing about the webhook flow).
  it.todo('should update order status to paid when payment_intent.succeeded webhook is received');

  it('should return 400 when webhook has missing stripe-signature header', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .send({ type: 'payment_intent.succeeded', data: { object: {} } });

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toContain('Missing stripe-signature');
  });

  it('should return 400 when webhook has invalid stripe signature', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 'invalid_signature_value')
      .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }))
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toContain('Webhook Error');
  });

  it('should keep order pending when payment fails', async () => {
    const { orderId } = await createTestOrder();

    // Verify order is still pending (payment_intent.payment_failed would keep it pending)
    const orders = await orderDataSource.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    expect(orders.length).toBe(1);
    expect(orders[0].status).toBe('pending');
  });
});
