import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp, MockAuthEventsPublisher } from '../setup';
import { cleanDatabase } from '../helpers/db.helper';
import { loginUser } from '../helpers/auth.helper';

interface LicenseShape {
  id: string;
  licenseKey: string;
  productSnapshot: { nameFr: string; nameEn: string; slug: string };
  orderId: string;
  productId: string;
  status: string;
  email: string;
}

interface LicensesListBody {
  data: LicenseShape[];
}

interface LicenseBody {
  data: LicenseShape;
}

/**
 * Insert a license_keys row directly in the payment-service DB.
 * Returns the inserted id.
 */
async function insertLicense(
  ds: DataSource,
  userId: string,
  opts?: { licenseKey?: string; email?: string; nameFr?: string; slug?: string },
): Promise<string> {
  const licenseKey = opts?.licenseKey ?? 'CYNA-AAAA-BBBB-CCCC-DDDD';
  const email = opts?.email ?? 'license-owner@test.cyna';
  const snapshot = {
    nameFr: opts?.nameFr ?? 'EDR',
    nameEn: opts?.nameFr ?? 'EDR',
    slug: opts?.slug ?? 'edr',
  };

  const result = await ds.query(
    `INSERT INTO license_keys
        (id, order_id, product_id, user_id, license_key, email, product_snapshot, status, activated_at, created_at, updated_at)
      VALUES
        (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1,
         $2, $3, $4::jsonb, 'active', NOW(), NOW(), NOW())
      RETURNING id`,
    [userId, licenseKey, email, JSON.stringify(snapshot)],
  );
  return result[0].id;
}

describe('Licenses (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let paymentDataSource: DataSource;
  let eventsSpy: MockAuthEventsPublisher;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    paymentDataSource = ctx.paymentDataSource;
    eventsSpy = ctx.eventsSpy;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    await cleanDatabase(paymentDataSource);
    eventsSpy.clear();
  });

  describe('GET /api/v1/licenses', () => {
    it('should return 401 without JWT', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/licenses');
      expect(res.status).toBe(401);
    });

    it('should return an empty array for a user with no licenses', async () => {
      const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
        email: 'licenses-empty@test.cyna',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/licenses')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const body = res.body as LicensesListBody;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });

    it('should return the licenses owned by the authenticated user', async () => {
      const { accessToken, userId } = await loginUser(app, dataSource, eventsSpy, {
        email: 'licenses-owner@test.cyna',
      });

      await insertLicense(paymentDataSource, userId, {
        licenseKey: 'CYNA-OWNR-2222-3333-4444',
        email: 'licenses-owner@test.cyna',
        nameFr: 'EDR',
        slug: 'edr',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/licenses')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      const body = res.body as LicensesListBody;
      expect(body.data.length).toBe(1);

      const license = body.data[0];
      expect(license.licenseKey).toBe('CYNA-OWNR-2222-3333-4444');
      expect(license.productSnapshot).toEqual({
        nameFr: 'EDR',
        nameEn: 'EDR',
        slug: 'edr',
      });
      expect(license.status).toBe('active');
    });
  });

  describe('GET /api/v1/licenses/:id', () => {
    it('should return 401 without JWT', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/licenses/550e8400-e29b-41d4-a716-446655440000',
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 for a malformed UUID', async () => {
      const { accessToken } = await loginUser(app, dataSource, eventsSpy, {
        email: 'licenses-bad-uuid@test.cyna',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/licenses/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 404 when the license belongs to another user', async () => {
      const { accessToken: ownerToken, userId: ownerId } = await loginUser(
        app,
        dataSource,
        eventsSpy,
        { email: 'licenses-other-owner@test.cyna' },
      );
      const { accessToken: intruderToken } = await loginUser(app, dataSource, eventsSpy, {
        email: 'licenses-intruder@test.cyna',
      });

      const licenseId = await insertLicense(paymentDataSource, ownerId, {
        licenseKey: 'CYNA-XXXX-YYYY-ZZZZ-WWWW',
        email: 'licenses-other-owner@test.cyna',
        nameFr: 'X',
        slug: 'x',
      });

      // Intruder cannot see the license → 404
      const intruderRes = await request(app.getHttpServer())
        .get(`/api/v1/licenses/${licenseId}`)
        .set('Authorization', `Bearer ${intruderToken}`);
      expect(intruderRes.status).toBe(404);

      // Owner can still read it → 200
      const ownerRes = await request(app.getHttpServer())
        .get(`/api/v1/licenses/${licenseId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerRes.status).toBe(200);

      const body = ownerRes.body as LicenseBody;
      expect(body.data.id).toBe(licenseId);
      expect(body.data.licenseKey).toBe('CYNA-XXXX-YYYY-ZZZZ-WWWW');
    });
  });
});
