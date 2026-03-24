import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import {
  loginUser,
  registerAndVerifyUser,
  DEFAULT_USER,
  extractRefreshToken,
} from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

interface TokenResponseBody {
  data: {
    accessToken: string;
    expiresIn: number;
    user: { id: string; email: string };
  };
}

describe('Auth - User Token Refresh (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
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
    await cleanDatabase(dataSource);
    eventsSpy.clear();
  });

  it('should refresh token from cookie and return new accessToken + new refresh_token cookie', async () => {
    const { cookies } = await loginUser(app, dataSource, eventsSpy);
    const refreshToken = extractRefreshToken(cookies);
    expect(refreshToken).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', [`refresh_token=${refreshToken}`])
      .send({})
      .expect(200);

    const body = res.body as TokenResponseBody;
    expect(body.data.accessToken).toBeDefined();
    expect(typeof body.data.accessToken).toBe('string');

    const newCookies: string[] = ([] as string[]).concat(res.headers['set-cookie'] || []);
    const newRefreshToken = extractRefreshToken(newCookies);
    expect(newRefreshToken).toBeDefined();
    expect(newRefreshToken).not.toBe(refreshToken);
  });

  it('should refresh token from body and return new accessToken', async () => {
    const { cookies } = await loginUser(app, dataSource, eventsSpy);
    const refreshToken = extractRefreshToken(cookies);
    expect(refreshToken).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken })
      .expect(200);

    const body = res.body as TokenResponseBody;
    expect(body.data.accessToken).toBeDefined();
    expect(typeof body.data.accessToken).toBe('string');
  });

  it('should return 401 when refreshing with an invalid token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: 'invalid-token-value' })
      .expect(401);
  });

  it('should revoke the oldest refresh token when max sessions (5) are exceeded', async () => {
    // Register and verify a single user
    await registerAndVerifyUser(app, dataSource, eventsSpy);

    const refreshTokens: string[] = [];

    // Login 6 times to create 6 sessions
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: DEFAULT_USER.email, password: DEFAULT_USER.password })
        .expect(200);

      const loginCookies: string[] = ([] as string[]).concat(res.headers['set-cookie'] || []);
      const rt = extractRefreshToken(loginCookies);
      expect(rt).toBeDefined();
      refreshTokens.push(rt as string);
    }

    // The 1st refresh token should be revoked (oldest, beyond max 5)
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: refreshTokens[0] })
      .expect(401);

    // The 6th (latest) should still work
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: refreshTokens[5] })
      .expect(200);
  });

  it('should allow reusing an old refresh token within the 30s grace period', async () => {
    const { cookies } = await loginUser(app, dataSource, eventsSpy);
    const refreshToken = extractRefreshToken(cookies);
    expect(refreshToken).toBeDefined();

    // First refresh - revokes the old token and issues a new one
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken })
      .expect(200);

    const body1 = res1.body as TokenResponseBody;
    expect(body1.data.accessToken).toBeDefined();

    // Immediately reuse the old (now revoked) token - should succeed within grace period
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken })
      .expect(200);

    const body2 = res2.body as TokenResponseBody;
    expect(body2.data.accessToken).toBeDefined();
  });
});
