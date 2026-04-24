import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BillingPeriod } from '@cyna-api/common';
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
import { CartResponse } from '../helpers/purchase.interfaces';

describe('Cart Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let catalogDataSource: DataSource;
  let orderDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  let product1: SeededProduct;
  let product2: SeededProduct;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    catalogDataSource = ctx.catalogDataSource;
    orderDataSource = ctx.orderDataSource;
    eventsSpy = ctx.eventsSpy;

    // Seed catalog data (shared across cart tests)
    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    const category = await seedCategory(catalogDataSource, {
      slug: 'cart-test-category',
      nameFr: 'Catégorie Cart',
      nameEn: 'Cart Category',
    });

    product1 = await seedProduct(catalogDataSource, category.id, {
      slug: 'cart-product-1',
      nameFr: 'Produit Cart 1',
      nameEn: 'Cart Product 1',
      priceMonthly: 29.99,
      priceYearly: 299.99,
      priceUnit: 9.99,
    });

    product2 = await seedProduct(catalogDataSource, category.id, {
      slug: 'cart-product-2',
      nameFr: 'Produit Cart 2',
      nameEn: 'Cart Product 2',
      priceMonthly: 49.99,
      priceYearly: 499.99,
      priceUnit: 19.99,
    });
  });

  afterAll(async () => {
    await cleanDatabase(catalogDataSource);
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    await cleanDatabase(orderDataSource);
    eventsSpy.clear();
  });

  it('should add product to cart as guest using X-Session-Id header', async () => {
    const sessionId = uuidv4();

    const res = await addToCart(app, product1.id, { sessionId, quantity: 1 });

    expect(res.status).toBeLessThanOrEqual(201);
    const body = res.body as CartResponse;
    expect(body.data).toBeDefined();
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].productId).toBe(product1.id);
    expect(body.data.items[0].quantity).toBe(1);
  });

  it('should add product to cart as authenticated user', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'cart-auth@example.com',
    });

    const res = await addToCart(app, product1.id, { accessToken, quantity: 2 });

    expect(res.status).toBeLessThanOrEqual(201);
    const body = res.body as CartResponse;
    expect(body.data).toBeDefined();
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].productId).toBe(product1.id);
    expect(body.data.items[0].quantity).toBe(2);
  });

  it('should update cart item quantity', async () => {
    const sessionId = uuidv4();

    // Add item first
    await addToCart(app, product1.id, { sessionId, quantity: 1 });

    // Update quantity
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${product1.id}`)
      .set('X-Session-Id', sessionId)
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    const body = res.body as CartResponse;
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].quantity).toBe(5);
  });

  it('should remove item from cart', async () => {
    const sessionId = uuidv4();

    // Add two items
    await addToCart(app, product1.id, { sessionId, quantity: 1 });
    await addToCart(app, product2.id, { sessionId, quantity: 1 });

    // Remove one
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${product1.id}`)
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    const body = res.body as CartResponse;
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].productId).toBe(product2.id);
  });

  it('should clear cart', async () => {
    const sessionId = uuidv4();

    // Add items
    await addToCart(app, product1.id, { sessionId, quantity: 1 });
    await addToCart(app, product2.id, { sessionId, quantity: 2 });

    // Clear cart
    const res = await request(app.getHttpServer())
      .delete('/api/v1/cart')
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);

    // Verify cart is empty
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('X-Session-Id', sessionId);

    const body = getRes.body as CartResponse;
    expect(body.data.items.length).toBe(0);
  });

  it('should merge guest cart into authenticated user cart', async () => {
    const sessionId = uuidv4();

    // Add item as guest
    await addToCart(app, product1.id, { sessionId, quantity: 3 });

    // Login
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'merge-cart@example.com',
    });

    // Add different item as authenticated user
    await addToCart(app, product2.id, { accessToken, quantity: 1 });

    // Merge guest cart into user cart
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(201);
    const body = res.body as CartResponse;
    expect(body.data.items.length).toBe(2);

    const productIds = body.data.items.map((item) => item.productId);
    expect(productIds).toContain(product1.id);
    expect(productIds).toContain(product2.id);
  });

  it('should update quantity when adding duplicate product with same billingPeriod', async () => {
    const sessionId = uuidv4();

    // Add product with quantity 2
    await addToCart(app, product1.id, {
      sessionId,
      quantity: 2,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    // Add same product with quantity 3
    const res = await addToCart(app, product1.id, {
      sessionId,
      quantity: 3,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    expect(res.status).toBeLessThanOrEqual(201);
    const body = res.body as CartResponse;
    // Should be one item with combined quantity (2+3=5)
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].quantity).toBe(5);
  });
});
