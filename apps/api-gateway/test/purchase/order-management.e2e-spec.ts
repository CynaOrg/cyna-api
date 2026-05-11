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
import {
  CartResponse,
  CheckoutResponse,
  OrdersListResponse,
  OrderDetailResponse,
} from '../helpers/purchase.interfaces';

describe('Order Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let catalogDataSource: DataSource;
  let orderDataSource: DataSource;
  let paymentDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  let product: SeededProduct;

  const billingAddress = {
    firstName: 'Order',
    lastName: 'Test',
    street: '1 Avenue des Champs-Élysées',
    city: 'Paris',
    postalCode: '75008',
    country: 'FR',
  };

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    userDataSource = ctx.userDataSource;
    catalogDataSource = ctx.catalogDataSource;
    orderDataSource = ctx.orderDataSource;
    paymentDataSource = ctx.paymentDataSource;
    eventsSpy = ctx.eventsSpy;

    // Seed catalog
    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    const category = await seedCategory(catalogDataSource, {
      slug: 'order-test-cat',
      nameFr: 'Catégorie Orders',
      nameEn: 'Orders Category',
    });

    product = await seedProduct(catalogDataSource, category.id, {
      slug: 'order-test-product',
      nameFr: 'Produit Order',
      nameEn: 'Order Product',
      priceMonthly: 59.99,
      priceYearly: 599.99,
      priceUnit: 59.99,
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
   * Helper to create an order for a user.
   * Returns the order info + access credentials.
   *
   * By default the order is created in PENDING state (as it would be the
   * moment the customer clicks "continue to payment"). Pass
   * `markPaid: true` to flip it to PAID — needed when the test reads back
   * through the user-facing /orders endpoints, which hide PENDING orders
   * to avoid surfacing abandoned checkouts.
   */
  async function createOrderForUser(
    email: string,
    options: { markPaid?: boolean } = {},
  ): Promise<{
    orderId: string;
    orderNumber: string;
    accessToken: string;
    userId: string;
  }> {
    const { accessToken, userId } = await loginUser(app, dataSource, eventsSpy, { email });

    // Add to cart
    const cartRes = await addToCart(app, product.id, { accessToken, quantity: 1 });
    const cartBody = cartRes.body as CartResponse;

    // Checkout
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cartId: cartBody.data.id, billingAddress, email });

    const checkout = checkoutRes.body as CheckoutResponse;

    if (options.markPaid) {
      await orderDataSource.query(
        `UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1`,
        [checkout.data.orderId],
      );
    }

    return {
      orderId: checkout.data.orderId,
      orderNumber: checkout.data.orderNumber,
      accessToken,
      userId,
    };
  }

  it('should list paid orders for authenticated user with 200', async () => {
    const { accessToken } = await createOrderForUser('order-list@example.com', {
      markPaid: true,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as OrdersListResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].orderNumber).toBeDefined();
    expect(body.data[0].status).toBe('paid');
  });

  it('should hide abandoned PENDING orders from the user order list', async () => {
    // User clicks "continue to payment", which creates the order, but never
    // submits a card. Stripe never fires a webhook → the row stays PENDING.
    // From the customer's perspective the order does not exist: they did not
    // pay, so it must not appear in their dashboard.
    const { accessToken } = await createOrderForUser('order-abandoned@example.com');

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as OrdersListResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should get order by ID with order details and items', async () => {
    const { orderId, accessToken } = await createOrderForUser('order-detail@example.com', {
      markPaid: true,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as OrderDetailResponse;
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(orderId);
    expect(body.data.items).toBeDefined();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0].productId).toBe(product.id);
  });

  it('should 404 on order detail for an abandoned PENDING order owned by the user', async () => {
    const { orderId, accessToken } = await createOrderForUser('order-pending-detail@example.com');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 404 when trying to access another user order', async () => {
    // Create an order for user A
    const { orderId } = await createOrderForUser('order-owner@example.com');

    // Login as user B
    const { accessToken: tokenB } = await loginUser(app, dataSource, eventsSpy, {
      email: 'order-stranger@example.com',
    });

    // Try to access user A's order with user B's token
    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Should be 404 (order not found for this user) or 403
    expect([403, 404]).toContain(res.status);
  });

  it('should return empty array for new user with no orders', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'order-empty@example.com',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as OrdersListResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
