import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { createAdmin, loginUser } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

/**
 * JWT payload shape used to craft test tokens.
 * Mirrors AccessTokenPayload from token.service.ts.
 */
interface TestJwtPayload {
  sub: string;
  email: string;
  type: 'user' | 'admin';
  role?: string;
  iat?: number;
  exp?: number;
}

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  /**
   * The JWT secret used by the gateway's JwtAuthGuard.
   * Must match the JWT_SECRET env var set during E2E test runs.
   * Falls back to the auth-service default for local development.
   */
  const jwtSecret: string = process.env.JWT_SECRET!;

  beforeAll(async () => {
    const testApp = await setupTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    userDataSource = testApp.userDataSource;
    eventsSpy = testApp.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    eventsSpy.clear();
  });

  describe('Protected route without token', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/logout').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('Protected route with malformed token', () => {
    it('should return 401 when Bearer token is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid-token-value')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('Protected route with expired token', () => {
    it('should return 401 when JWT has expired', async () => {
      const payload: TestJwtPayload = {
        sub: '00000000-0000-0000-0000-000000000001',
        email: 'expired@example.com',
        type: 'user',
      };

      // Sign a token that expired 1 hour ago
      const expiredToken = jwt.sign(payload, jwtSecret, { expiresIn: -3600 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('@Public() route without token', () => {
    it('should not return 401 for a public endpoint', async () => {
      // POST /api/v1/auth/login is @Public() - sending empty body should give 400 (validation), not 401
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({});

      expect(res.status).not.toBe(401);
      // It should be a validation error (400) since no body fields are provided
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Admin-only route with regular user token', () => {
    it('should return 403 when a user token is used on an admin endpoint', async () => {
      // Create a real user and get their token
      const { accessToken } = await loginUser(app, dataSource, eventsSpy);

      // Try to access admin logout endpoint (requires JwtAdminAuthGuard)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe('Super admin route with regular admin token', () => {
    it('should return 403 when a commercial admin accesses a super_admin endpoint', async () => {
      // Create a commercial (non-super) admin and get their token via full login flow
      const commercialAdmin = {
        email: 'commercial@cyna.it',
        password: 'CommercialPass123!',
        firstName: 'Commercial',
        lastName: 'Admin',
        role: 'commercial' as const,
      };
      await createAdmin(dataSource, commercialAdmin);

      // Login step 1: get tempToken
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/login')
        .send({ email: commercialAdmin.email, password: commercialAdmin.password });

      const tempToken: string = loginRes.body.data.tempToken;
      const code = eventsSpy.get2FACode(commercialAdmin.email);
      expect(code).toBeDefined();

      // Login step 2: verify 2FA
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/admin/verify-2fa')
        .send({ tempToken, code });

      const commercialToken: string = verifyRes.body.data.accessToken;

      // Try to access super admin only route: GET /api/v1/admin/admins
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/admins')
        .set('Authorization', `Bearer ${commercialToken}`);

      expect(res.status).toBe(403);
    });
  });
});
