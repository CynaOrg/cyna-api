import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { loginUser, extractRefreshToken, isRefreshTokenCleared } from '../helpers/auth.helper';
import { cleanDatabase } from '../helpers/db.helper';

describe('Auth - User Logout (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    userDataSource = ctx.userDataSource;
    eventsSpy = ctx.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource, userDataSource);
    eventsSpy.clear();
  });

  it('should logout with a valid JWT and clear the refresh_token cookie', async () => {
    const { accessToken, cookies } = await loginUser(app, dataSource, eventsSpy);
    const refreshToken = extractRefreshToken(cookies);
    expect(refreshToken).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', [`refresh_token=${refreshToken}`])
      .send({})
      .expect(200);

    const body = res.body as { data: { message: string } };
    expect(body.data.message).toBeDefined();

    // The refresh_token cookie should be cleared
    const resCookies: string[] = ([] as string[]).concat(res.headers['set-cookie'] || []);
    expect(isRefreshTokenCleared(resCookies)).toBe(true);
  });

  it('should return 401 when logging out without a JWT', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').send({}).expect(401);
  });

  it('should not error when logging out twice with the same token', async () => {
    const { accessToken, cookies } = await loginUser(app, dataSource, eventsSpy);
    const refreshToken = extractRefreshToken(cookies);
    expect(refreshToken).toBeDefined();

    // First logout
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', [`refresh_token=${refreshToken}`])
      .send({})
      .expect(200);

    // Second logout with the same access token (still valid JWT, refresh already revoked)
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', [`refresh_token=${refreshToken}`])
      .send({})
      .expect(200);
  });
});
