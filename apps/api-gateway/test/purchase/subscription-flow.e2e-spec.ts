import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingPeriod } from '@cyna-api/common';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { cleanDatabase } from '../helpers/db.helper';
import { loginUser } from '../helpers/auth.helper';
import {
  seedCategory,
  seedProduct,
  resetSeedCounters,
  SeededProduct,
} from '../helpers/purchase.helper';
import {
  SubscriptionCreateResponse,
  SubscriptionsListResponse,
  SubscriptionCancelResponse,
} from '../helpers/purchase.interfaces';

describe('Subscription Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let catalogDataSource: DataSource;
  let paymentDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  let product: SeededProduct;

  const billingAddress = {
    firstName: 'Sub',
    lastName: 'Test',
    street: '5 Boulevard Haussmann',
    city: 'Paris',
    postalCode: '75009',
    country: 'FR',
  };

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    userDataSource = ctx.userDataSource;
    catalogDataSource = ctx.catalogDataSource;
    paymentDataSource = ctx.paymentDataSource;
    eventsSpy = ctx.eventsSpy;

    // Seed catalog
    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    const category = await seedCategory(catalogDataSource, {
      slug: 'sub-test-cat',
      nameFr: 'Catégorie Subscriptions',
      nameEn: 'Subscriptions Category',
    });

    product = await seedProduct(catalogDataSource, category.id, {
      slug: 'sub-test-product',
      nameFr: 'Produit Abonnement',
      nameEn: 'Subscription Product',
      priceMonthly: 39.99,
      priceYearly: 399.99,
      stripePriceIdMonthly: 'price_monthly_sub_test',
      stripePriceIdYearly: 'price_yearly_sub_test',
    });
  });

  afterAll(async () => {
    await cleanDatabase(catalogDataSource);
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    await cleanDatabase(paymentDataSource);
    eventsSpy.clear();
  });

  it('should create a monthly subscription successfully', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-monthly@example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress,
      });

    expect(res.status).toBe(201);
    const body = res.body as SubscriptionCreateResponse;
    expect(body.data.clientSecret).toBeDefined();
    expect(body.data.subscriptionId).toBeDefined();
  });

  it('should create a yearly subscription successfully', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-yearly@example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.YEARLY,
        billingAddress,
      });

    expect(res.status).toBe(201);
    const body = res.body as SubscriptionCreateResponse;
    expect(body.data.clientSecret).toBeDefined();
    expect(body.data.subscriptionId).toBeDefined();
  });

  it('should list subscriptions for authenticated user', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-list@example.com',
    });

    // Create a subscription first
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress,
      });
    const subscriptionId = (createRes.body as SubscriptionCreateResponse).data.subscriptionId;

    // The row is persisted in INCOMPLETE and is filtered out of every
    // user/admin read until the `customer.subscription.updated` webhook flips
    // it to ACTIVE. The webhook is asynchronous in real life; in this e2e
    // suite we don't have Stripe firing real events, so we promote the row
    // directly to ACTIVE to simulate that observable end state.
    await paymentDataSource.query(`UPDATE subscriptions SET status = 'active' WHERE id = $1`, [
      subscriptionId,
    ]);

    // List subscriptions
    const res = await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as SubscriptionsListResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].productId).toBe(product.id);
  });

  it('should hide INCOMPLETE subscriptions from the user listing', async () => {
    // Abandoned payment flow: the customer clicked "subscribe" (row created in
    // INCOMPLETE) and walked away without paying. The cleanup cron will
    // eventually hard-delete the row; in the meantime it must NEVER surface
    // in the customer dashboard.
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-abandoned@example.com',
    });

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress,
      });

    const res = await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = res.body as SubscriptionsListResponse;
    expect(body.data).toEqual([]);
  });

  it('should cancel a subscription and update its status', async () => {
    const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-cancel@example.com',
    });

    // Create subscription
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress,
      });

    const createBody = createRes.body as SubscriptionCreateResponse;
    const subscriptionId = createBody.data.subscriptionId;

    // Cancel subscription
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${subscriptionId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancelAtPeriodEnd: true });

    expect(cancelRes.status).toBe(201);
    const cancelBody = cancelRes.body as SubscriptionCancelResponse;
    expect(cancelBody.data).toBeDefined();
    expect(cancelBody.data.cancelAtPeriodEnd).toBe(true);
    expect(cancelBody.data.cancelledAt).toBeDefined();
  });

  it('should not allow User B to cancel User A subscription', async () => {
    // Create User A and their subscription
    const { accessToken: tokenA } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-owner-a@example.com',
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress,
      });

    expect(createRes.status).toBe(201);
    const createBody = createRes.body as SubscriptionCreateResponse;
    const subscriptionIdA = createBody.data.subscriptionId;

    // Create User B
    const { accessToken: tokenB } = await loginUser(app, dataSource, eventsSpy, {
      email: 'sub-stranger-b@example.com',
    });

    // User B tries to cancel User A's subscription
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${subscriptionIdA}/cancel`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ cancelAtPeriodEnd: true });

    // Should be rejected: 403 (forbidden) or 404 (not found for this user)
    expect([403, 404]).toContain(cancelRes.status);
  });

  it('should return 401 when creating subscription without auth', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/subscriptions').send({
      productId: product.id,
      billingPeriod: BillingPeriod.MONTHLY,
      billingAddress,
    });

    expect(res.status).toBe(401);
  });
});
