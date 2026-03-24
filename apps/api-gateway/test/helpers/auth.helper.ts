import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MockAuthEventsPublisher } from '../setup';

export const DEFAULT_USER = {
  email: 'test@example.com',
  password: 'TestPass123!',
  firstName: 'Test',
  lastName: 'User',
};

export const DEFAULT_ADMIN = {
  email: 'admin@cyna.it',
  password: 'AdminPass123!',
  firstName: 'Admin',
  lastName: 'Test',
  role: 'super_admin' as const,
};

/**
 * Register a user via POST /api/v1/auth/register.
 * Returns the raw supertest Response.
 */
export async function registerUser(
  app: INestApplication,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ ...DEFAULT_USER, ...dto });
}

/**
 * Register a user and verify their email using the raw verification token
 * captured by the MockAuthEventsPublisher spy.
 *
 * Returns the userId and the registration response.
 */
export async function registerAndVerifyUser(
  app: INestApplication,
  dataSource: DataSource,
  eventsSpy: MockAuthEventsPublisher,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<{ userId: string; response: request.Response }> {
  const userData = { ...DEFAULT_USER, ...dto };

  // Register the user
  const registerRes = await registerUser(app, dto);
  const userId = registerRes.body?.data?.user?.id;

  // Get the raw verification token from the events spy
  const token = eventsSpy.getVerificationToken(userData.email);
  if (!token) {
    throw new Error(
      `No verification token captured for ${userData.email}. ` +
        `Check that AuthEventsPublisher is correctly overridden.`,
    );
  }

  // Verify email
  await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

  return { userId, response: registerRes };
}

/**
 * Register a user, verify their email, and log them in.
 * Returns the accessToken and the set-cookie headers.
 */
export async function loginUser(
  app: INestApplication,
  dataSource: DataSource,
  eventsSpy: MockAuthEventsPublisher,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<{ accessToken: string; cookies: string[]; userId: string }> {
  const userData = { ...DEFAULT_USER, ...dto };

  // Register + verify
  const { userId } = await registerAndVerifyUser(app, dataSource, eventsSpy, dto);

  // Login
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
    email: userData.email,
    password: userData.password,
  });

  return {
    accessToken: res.body?.data?.accessToken,
    cookies: ([] as string[]).concat(res.headers['set-cookie'] || []),
    userId,
  };
}

/**
 * Insert an admin directly into the database with a bcrypt-hashed password.
 * Bypasses the registration flow (admins are created in DB, not via API in CYNA).
 */
/**
 * Extract the raw refresh_token value from a set-cookie header array.
 */
export function extractRefreshToken(cookies: string[]): string | undefined {
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) return undefined;
  return cookie.split('=')[1].split(';')[0];
}

/**
 * Check whether the set-cookie header clears the refresh_token cookie.
 */
export function isRefreshTokenCleared(cookies: string[]): boolean {
  return cookies.some(
    (c) =>
      c.startsWith('refresh_token=') &&
      (c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970')),
  );
}

export async function createAdmin(
  dataSource: DataSource,
  dto?: Partial<typeof DEFAULT_ADMIN>,
): Promise<{ id: string }> {
  const admin = { ...DEFAULT_ADMIN, ...dto };
  const passwordHash = await bcrypt.hash(admin.password, 12);

  const result = await dataSource.query(
    `INSERT INTO admins (email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [admin.email, passwordHash, admin.firstName, admin.lastName, admin.role],
  );

  return { id: result[0].id };
}
