import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { registerAndVerifyUser, DEFAULT_USER } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

describe('Auth - User Password Reset (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    eventsSpy = ctx.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    eventsSpy.clear();
  });

  it('should return 200 when requesting password reset for an existing email', async () => {
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: DEFAULT_USER.email })
      .expect(200);

    const body = res.body as { data: { success: boolean; message: string } };
    expect(body.data.success).toBe(true);
    expect(eventsSpy.events.passwordResetRequested.length).toBe(1);
  });

  it('should return 200 for a non-existent email (no information leak)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' })
      .expect(200);

    const body = res.body as { data: { success: boolean; message: string } };
    expect(body.data.success).toBe(true);
    // No event should have been emitted since user does not exist
    expect(eventsSpy.events.passwordResetRequested.length).toBe(0);
  });

  it('should reset password with a valid reset token', async () => {
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    // Request password reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: DEFAULT_USER.email })
      .expect(200);

    const resetToken = eventsSpy.getResetToken(DEFAULT_USER.email);
    expect(resetToken).toBeDefined();

    // Reset the password
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewSecure123!' })
      .expect(200);

    const body = res.body as { data: { success: boolean; message: string } };
    expect(body.data.success).toBe(true);
  });

  it('should reject password reset with an invalid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'invalid-reset-token', newPassword: 'NewSecure123!' })
      .expect(400);

    const body = res.body as { error: string };
    expect(body.error).toBe('INVALID_TOKEN');
  });

  it('should reject reused reset token', async () => {
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    // Request password reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: DEFAULT_USER.email })
      .expect(200);

    const resetToken = eventsSpy.getResetToken(DEFAULT_USER.email);
    expect(resetToken).toBeDefined();

    // Use the token to reset password
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewSecure123!' })
      .expect(200);

    // Try to reuse the same token
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: 'AnotherPass456!' })
      .expect(400);

    const body = res.body as { error: string };
    expect(body.error).toBe('INVALID_TOKEN');
  });

  it('should allow login with the new password after a successful reset', async () => {
    const newPassword = 'ResetPass456!';

    await registerAndVerifyUser(app, dataSource, eventsSpy);

    // Request and perform password reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: DEFAULT_USER.email })
      .expect(200);

    const resetToken = eventsSpy.getResetToken(DEFAULT_USER.email);
    expect(resetToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword })
      .expect(200);

    // Login with old password should fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: DEFAULT_USER.password })
      .expect(401);

    // Login with new password should succeed
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEFAULT_USER.email, password: newPassword })
      .expect(200);

    const loginBody = loginRes.body as { data: { accessToken: string } };
    expect(loginBody.data.accessToken).toBeDefined();
  });
});
