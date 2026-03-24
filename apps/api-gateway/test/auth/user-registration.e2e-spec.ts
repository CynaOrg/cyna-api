import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { registerUser, DEFAULT_USER } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

describe('User Registration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  beforeAll(async () => {
    const testContext = await setupTestApp();
    app = testContext.app;
    dataSource = testContext.dataSource;
    eventsSpy = testContext.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    eventsSpy.clear();
  });

  // 1. Register with valid data -> 201 + user returned (no passwordHash)
  it('should register a user with valid data and return 201 without passwordHash', async () => {
    const res = await registerUser(app);

    expect(res.status).toBe(201);

    const body = res.body as {
      data: {
        message: string;
        user: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          passwordHash?: string;
        };
      };
    };

    expect(body.data.message).toBeDefined();
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBe(DEFAULT_USER.email);
    expect(body.data.user.firstName).toBe(DEFAULT_USER.firstName);
    expect(body.data.user.lastName).toBe(DEFAULT_USER.lastName);
    expect(body.data.user.id).toBeDefined();

    // Ensure passwordHash is NOT exposed in the response
    expect(body.data.user.passwordHash).toBeUndefined();

    // Verify that a verification token was emitted
    const token = eventsSpy.getVerificationToken(DEFAULT_USER.email);
    expect(token).toBeDefined();
  });

  // 2. Register with existing email -> 409 Conflict
  it('should return 409 when registering with an already used email', async () => {
    // First registration
    await registerUser(app);

    // Second registration with the same email
    const res = await registerUser(app);

    expect(res.status).toBe(409);

    const body = res.body as { message: string; error: string };
    expect(body.error).toBe('EMAIL_EXISTS');
  });

  // 3. Register with weak password (no uppercase) -> 400
  it('should return 400 when password has no uppercase letter', async () => {
    const res = await registerUser(app, {
      password: 'weakpass123!',
    });

    expect(res.status).toBe(400);
  });

  // 4. Register with weak password (no special char) -> 400
  it('should return 400 when password has no special character', async () => {
    const res = await registerUser(app, {
      password: 'WeakPass123',
    });

    expect(res.status).toBe(400);
  });

  // 5. Register with invalid email -> 400
  it('should return 400 when email format is invalid', async () => {
    const res = await registerUser(app, {
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });

  // 6. Verify email with valid token -> success
  it('should verify email successfully with a valid verification token', async () => {
    // Register a user first
    await registerUser(app);

    // Get the raw verification token captured by the events spy
    const token = eventsSpy.getVerificationToken(DEFAULT_USER.email);
    expect(token).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token });

    expect(res.status).toBe(200);

    const body = res.body as { data: { success: boolean; message: string } };
    expect(body.data.success).toBe(true);
  });

  // 7. Verify email with invalid token -> error
  it('should return an error when verifying email with an invalid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-token-that-does-not-exist' });

    expect(res.status).toBe(400);

    const body = res.body as { error: string };
    expect(body.error).toBe('INVALID_TOKEN');
  });

  // 8. Resend verification -> success
  it('should resend verification email for an unverified user', async () => {
    // Register a user first
    await registerUser(app);

    // Clear events so we can check for new ones
    eventsSpy.clear();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .send({ email: DEFAULT_USER.email });

    expect(res.status).toBe(200);

    const body = res.body as { data: { success: boolean; message: string } };
    expect(body.data.success).toBe(true);

    // A new verification token should have been emitted
    const newToken = eventsSpy.getVerificationToken(DEFAULT_USER.email);
    expect(newToken).toBeDefined();
  });
});
