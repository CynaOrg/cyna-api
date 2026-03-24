import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { cleanDatabase } from '../helpers/db.helper';

/**
 * Rate limiting tests.
 *
 * These tests verify that the @Throttle() decorators on auth endpoints
 * correctly reject requests once the limit is exceeded.
 *
 * ThrottlerModule uses in-memory storage, so a fresh app instance
 * (via setupTestApp in beforeAll) ensures clean counters.
 *
 * Rate limits from the controllers:
 * - POST /api/v1/auth/login         -> 5 req/min
 * - POST /api/v1/auth/register      -> 3 req/min
 * - POST /api/v1/auth/forgot-password -> 3 req/5min
 */
describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

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
    await cleanDatabase(dataSource);
    eventsSpy.clear();
  });

  describe('POST /api/v1/auth/login rate limit (5 req/min)', () => {
    it('should return 429 after exceeding the login rate limit', async () => {
      const loginPayload = { email: 'test@example.com', password: 'SomePass123!' };

      // Send 6 requests sequentially; the endpoint allows 5 per minute
      const responses: request.Response[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginPayload);
        responses.push(res);
      }

      const statusCodes = responses.map((r) => r.status);

      // The 6th request should be rate limited (429 Too Many Requests)
      expect(statusCodes[5]).toBe(429);

      // The first 5 should NOT be 429 (they should be 401 for bad credentials or other errors)
      for (let i = 0; i < 5; i++) {
        expect(statusCodes[i]).not.toBe(429);
      }
    });
  });

  describe('POST /api/v1/auth/register rate limit (3 req/min)', () => {
    it('should return 429 after exceeding the register rate limit', async () => {
      // Send 4 requests sequentially; the endpoint allows 3 per minute
      const responses: request.Response[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: `user${i}@example.com`,
            password: 'TestPass123!',
            firstName: 'Test',
            lastName: 'User',
          });
        responses.push(res);
      }

      const statusCodes = responses.map((r) => r.status);

      // The 4th request should be rate limited (429 Too Many Requests)
      expect(statusCodes[3]).toBe(429);

      // The first 3 should NOT be rate limited
      for (let i = 0; i < 3; i++) {
        expect(statusCodes[i]).not.toBe(429);
      }
    });
  });

  describe('POST /api/v1/auth/forgot-password rate limit (3 req/5min)', () => {
    it('should return 429 after exceeding the forgot-password rate limit', async () => {
      const forgotPayload = { email: 'test@example.com' };

      // Send 4 requests sequentially; the endpoint allows 3 per 5 minutes
      const responses: request.Response[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/forgot-password')
          .send(forgotPayload);
        responses.push(res);
      }

      const statusCodes = responses.map((r) => r.status);

      // The 4th request should be rate limited (429 Too Many Requests)
      expect(statusCodes[3]).toBe(429);

      // The first 3 should NOT be rate limited
      for (let i = 0; i < 3; i++) {
        expect(statusCodes[i]).not.toBe(429);
      }
    });
  });
});
