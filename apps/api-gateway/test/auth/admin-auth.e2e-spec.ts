import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { createAdmin, DEFAULT_ADMIN } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

describe('Admin Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;
  let adminId: string;

  beforeAll(async () => {
    const testApp = await setupTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    eventsSpy = testApp.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    eventsSpy.clear();
    const admin = await createAdmin(dataSource);
    adminId = admin.id;
  });

  describe('POST /api/v1/auth/admin/login', () => {
    it('should return requires2FA: true and a tempToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      expect(res.status).toBe(200);
      const body = res.body as { data: { requires2FA: boolean; tempToken: string } };
      expect(body.data.requires2FA).toBe(true);
      expect(body.data.tempToken).toBeDefined();
      expect(typeof body.data.tempToken).toBe('string');
    });
  });

  describe('POST /api/v1/auth/admin/verify-2fa', () => {
    it('should return accessToken and set admin_refresh_token cookie with correct 2FA code', async () => {
      // Step 1: Login to get tempToken
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const loginBody = loginRes.body as { data: { tempToken: string } };
      const tempToken = loginBody.data.tempToken;

      // Get the 2FA code from the events spy
      const code = eventsSpy.get2FACode(DEFAULT_ADMIN.email);
      expect(code).toBeDefined();

      // Step 2: Verify 2FA
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code });

      expect(verifyRes.status).toBe(200);
      const verifyBody = verifyRes.body as { data: { accessToken: string } };
      expect(verifyBody.data.accessToken).toBeDefined();
      expect(typeof verifyBody.data.accessToken).toBe('string');

      // Ensure passwordHash is never leaked in the response
      expect((verifyBody.data as Record<string, unknown>).admin).toBeDefined();
      expect(
        ((verifyBody.data as Record<string, unknown>).admin as Record<string, unknown>)
          .passwordHash,
      ).toBeUndefined();

      // Check admin_refresh_token cookie is set
      const cookies: string[] = ([] as string[]).concat(verifyRes.headers['set-cookie'] || []);
      const refreshCookie = cookies.find((c: string) => c.startsWith('admin_refresh_token='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('should return 401 with wrong 2FA code', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const tempToken = (loginRes.body as { data: { tempToken: string } }).data.tempToken;

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code: '000000' });

      expect(verifyRes.status).toBe(401);
    });

    it('should return 401 with expired 2FA code', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const tempToken = (loginRes.body as { data: { tempToken: string } }).data.tempToken;

      // Get the valid code
      const code = eventsSpy.get2FACode(DEFAULT_ADMIN.email);
      expect(code).toBeDefined();

      // Expire the code by updating expiresAt in DB to a past date
      await dataSource.query(
        `UPDATE admin_2fa_codes SET expires_at = NOW() - INTERVAL '1 hour' WHERE admin_id = $1`,
        [adminId],
      );

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code });

      expect(verifyRes.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/admin/resend-2fa', () => {
    it('should send a new 2FA code', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const tempToken = (loginRes.body as { data: { tempToken: string } }).data.tempToken;

      // Clear events to track new emission
      eventsSpy.clear();

      const resendRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/resend-2fa')
        .send({ tempToken });

      expect(resendRes.status).toBe(200);
      const resendBody = resendRes.body as { data: { requires2FA: boolean; tempToken: string } };
      expect(resendBody.data.requires2FA).toBe(true);
      expect(resendBody.data.tempToken).toBeDefined();

      // A new 2FA code should have been emitted
      const newCode = eventsSpy.get2FACode(DEFAULT_ADMIN.email);
      expect(newCode).toBeDefined();
      // The new code may differ from the original (probabilistic but very likely with 6 digits)
      // More importantly, the new code should work
      expect(typeof newCode).toBe('string');
      expect(newCode).toHaveLength(6);
    });
  });

  describe('POST /api/v1/auth/admin/refresh-token', () => {
    it('should return a new accessToken when given a valid refresh token cookie', async () => {
      // Login + 2FA to get tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const tempToken = (loginRes.body as { data: { tempToken: string } }).data.tempToken;
      const code = eventsSpy.get2FACode(DEFAULT_ADMIN.email);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code });

      // Extract admin_refresh_token cookie
      const cookies: string[] = ([] as string[]).concat(verifyRes.headers['set-cookie'] || []);
      const refreshCookie = cookies.find((c: string) => c.startsWith('admin_refresh_token='));
      expect(refreshCookie).toBeDefined();

      // Use the cookie to refresh
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/refresh-token')
        .set('Cookie', cookies)
        .send({});

      expect(refreshRes.status).toBe(200);
      const refreshBody = refreshRes.body as { data: { accessToken: string } };
      expect(refreshBody.data.accessToken).toBeDefined();
      expect(typeof refreshBody.data.accessToken).toBe('string');
    });
  });

  describe('POST /api/v1/auth/admin/logout', () => {
    it('should logout and revoke the refresh token', async () => {
      // Login + 2FA
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

      const tempToken = (loginRes.body as { data: { tempToken: string } }).data.tempToken;
      const code = eventsSpy.get2FACode(DEFAULT_ADMIN.email);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code });

      const accessToken = (verifyRes.body as { data: { accessToken: string } }).data.accessToken;
      const cookies: string[] = ([] as string[]).concat(verifyRes.headers['set-cookie'] || []);

      // Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', cookies)
        .send({});

      expect(logoutRes.status).toBe(200);

      // Trying to refresh with the same cookie should fail
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/refresh-token')
        .set('Cookie', cookies)
        .send({});

      expect(refreshRes.status).toBe(401);
    });
  });
});
