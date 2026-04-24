import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { registerUser, registerAndVerifyUser, DEFAULT_USER } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

describe('User Login (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  beforeAll(async () => {
    const testContext = await setupTestApp();
    app = testContext.app;
    dataSource = testContext.dataSource;
    userDataSource = testContext.userDataSource;
    eventsSpy = testContext.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    eventsSpy.clear();
  });

  // 1. Login with valid credentials -> 200 + accessToken + refresh_token cookie (httpOnly)
  it('should return 200 with accessToken and refresh_token httpOnly cookie for valid credentials', async () => {
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: DEFAULT_USER.password });

    expect(res.status).toBe(200);

    const body = res.body as {
      data: {
        accessToken: string;
        expiresIn: number;
        user: { id: string; email: string };
      };
    };

    expect(body.data.accessToken).toBeDefined();
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.expiresIn).toBeDefined();
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBe(DEFAULT_USER.email);

    // refreshToken should NOT be in the JSON body (sent as httpOnly cookie instead)
    expect((body.data as Record<string, unknown>).refreshToken).toBeUndefined();

    // Verify refresh_token cookie is set and httpOnly
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
    const refreshCookie = cookies.find((c: string) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  // 2. Login with wrong password -> 401
  it('should return 401 when password is incorrect', async () => {
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: 'WrongPassword123!' });

    expect(res.status).toBe(401);

    const body = res.body as { message: string; error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  // 3. Login with non-existent email -> 401 (same error message as wrong password for security)
  it('should return 401 with same error code for non-existent email (prevents user enumeration)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'SomePass123!' });

    expect(res.status).toBe(401);

    const body = res.body as { message: string; error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  // 4. Login with unverified email -> 403
  it('should return 403 when email is not verified', async () => {
    // Register but do NOT verify
    await registerUser(app);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: DEFAULT_USER.password });

    expect(res.status).toBe(403);

    const body = res.body as { message: string; error: string };
    expect(body.error).toBe('EMAIL_NOT_VERIFIED');
  });

  // 5. Login with disabled account -> 403
  it('should return 403 when account is disabled', async () => {
    const { userId } = await registerAndVerifyUser(app, dataSource, eventsSpy);

    // Disable the account directly in the database
    await dataSource.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: DEFAULT_USER.password });

    expect(res.status).toBe(403);

    const body = res.body as { message: string; error: string };
    expect(body.error).toBe('ACCOUNT_DISABLED');
  });
});
