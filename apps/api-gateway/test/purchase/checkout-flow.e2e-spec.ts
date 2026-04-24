import { INestApplication } from '@nestjs/common';
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

/** The seeded product price used across checkout tests */
const PRODUCT_PRICE_UNIT = 49.99;

/** VAT rate applied by the order service (simplified 20% for EU) */
const VAT_RATE = 0.2;

/**
 * Calculate the expected checkout amount in cents, matching the server-side
 * calculation in order.service.ts:
 *   subtotal = priceUnit * quantity
 *   taxAmount = Math.round(subtotal * 0.2 * 100) / 100
 *   total = subtotal + taxAmount
 *   amountCents = Math.round(total * 100)
 */
function expectedAmountCents(priceUnit: number, quantity: number): number {
  const subtotal = priceUnit * quantity;
  const taxAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = subtotal + taxAmount;
  return Math.round(total * 100);
}

describe('Checkout Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let catalogDataSource: DataSource;
  let orderDataSource: DataSource;
  let paymentDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  let product: SeededProduct;

  const billingAddress = {
    firstName: 'Test',
    lastName: 'Checkout',
    street: '10 rue de la Paix',
    city: 'Paris',
    postalCode: '75002',
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
      slug: 'checkout-test-cat',
      nameFr: 'Catégorie Checkout',
      nameEn: 'Checkout Category',
    });

    product = await seedProduct(catalogDataSource, category.id, {
      slug: 'checkout-product',
      nameFr: 'Produit Checkout',
      nameEn: 'Checkout Product',
      priceMonthly: 49.99,
      priceYearly: 499.99,
      priceUnit: PRODUCT_PRICE_UNIT,
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

  it('should complete full checkout: add to cart, create payment intent, order created with status pending', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'checkout-full@example.com',
    });

    // Add item to cart
    const quantity = 1;
    const cartRes = await addToCart(app, product.id, { accessToken, quantity });
    expect(cartRes.status).toBeLessThanOrEqual(201);
    const cartBody = cartRes.body as CartResponse;
    const cartId = cartBody.data.id;
    expect(cartId).toBeDefined();

    // Create payment intent
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cartId,
        billingAddress,
        email: 'checkout-full@example.com',
      });

    expect(checkoutRes.status).toBe(201);
    const checkoutBody = checkoutRes.body as CheckoutResponse;
    expect(checkoutBody.data.clientSecret).toBeDefined();
    expect(checkoutBody.data.paymentIntentId).toBeDefined();
    expect(checkoutBody.data.orderId).toBeDefined();
    expect(checkoutBody.data.orderNumber).toMatch(/^CYN-\d{4}-\d{5}$/);
    expect(checkoutBody.data.currency).toBe('eur');

    // Verify amount matches server-side price (priceUnit * quantity + 20% VAT, in cents)
    expect(checkoutBody.data.amount).toBe(expectedAmountCents(PRODUCT_PRICE_UNIT, quantity));

    // Verify order was created in DB with pending status
    const orders = await orderDataSource.query('SELECT * FROM orders WHERE id = $1', [
      checkoutBody.data.orderId,
    ]);
    expect(orders.length).toBe(1);
    expect(orders[0].status).toBe('pending');
  });

  it('should return 400 when checkout is attempted without billing address', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'checkout-noaddr@example.com',
    });

    // Add item to cart
    const cartRes = await addToCart(app, product.id, { accessToken, quantity: 1 });
    const cartBody = cartRes.body as CartResponse;

    // Attempt checkout without billingAddress
    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cartId: cartBody.data.id,
        email: 'checkout-noaddr@example.com',
        // billingAddress is missing
      });

    // The endpoint requires billingAddress; should fail
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should return error when checkout is attempted with empty cart', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'checkout-empty@example.com',
    });

    // Use a random cartId that doesn't exist
    const fakeCartId = uuidv4();

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cartId: fakeCartId,
        billingAddress,
        email: 'checkout-empty@example.com',
      });

    // Should fail - cart not found or empty
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should allow guest checkout with email', async () => {
    const sessionId = uuidv4();

    // Add item as guest
    const cartRes = await addToCart(app, product.id, { sessionId, quantity: 1 });
    expect(cartRes.status).toBeLessThanOrEqual(201);
    const cartBody = cartRes.body as CartResponse;
    const cartId = cartBody.data.id;

    // Guest checkout (no auth token, but OptionalJwtAuthGuard allows it)
    const res = await request(app.getHttpServer()).post('/api/v1/checkout/payment-intent').send({
      cartId,
      billingAddress,
      email: 'guest-checkout@example.com',
    });

    expect(res.status).toBe(201);
    const body = res.body as CheckoutResponse;
    expect(body.data.orderId).toBeDefined();
    expect(body.data.clientSecret).toBeDefined();

    // Verify order customer email
    const orders = await orderDataSource.query('SELECT * FROM orders WHERE id = $1', [
      body.data.orderId,
    ]);
    expect(orders.length).toBe(1);
    expect(orders[0].customer_email).toBe('guest-checkout@example.com');
  });

  it('should have order items in the database after checkout', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'checkout-items@example.com',
    });

    const quantity = 2;

    // Add to cart
    const cartRes = await addToCart(app, product.id, { accessToken, quantity });
    const cartBody = cartRes.body as CartResponse;

    // Checkout
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout/payment-intent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        cartId: cartBody.data.id,
        billingAddress,
        email: 'checkout-items@example.com',
      });

    expect(checkoutRes.status).toBe(201);
    const checkoutBody = checkoutRes.body as CheckoutResponse;

    // Verify amount matches for 2 items (priceUnit * quantity + 20% VAT, in cents)
    expect(checkoutBody.data.amount).toBe(expectedAmountCents(PRODUCT_PRICE_UNIT, quantity));

    // Check order items exist in DB
    const orderItems = await orderDataSource.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [checkoutBody.data.orderId],
    );
    expect(orderItems.length).toBe(1);
    expect(orderItems[0].product_id).toBe(product.id);
    expect(orderItems[0].quantity).toBe(2);
  });
});
