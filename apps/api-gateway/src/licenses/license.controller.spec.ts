import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { SERVICE_NAMES } from '@cyna-api/common';
import { Request } from 'express';
import { LicenseController } from './license.controller';
import { JwtAuthGuard } from '../auth/guards';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; type: string; role?: string };
}

function buildRequest(userId: string): AuthenticatedRequest {
  return {
    user: { id: userId, email: 'user@test.cyna', type: 'user' },
  } as AuthenticatedRequest;
}

function buildRawLicense(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'lic-1',
    licenseKey: 'CYNA-XXXX-YYYY-ZZZZ-WWWW',
    productSnapshot: { nameFr: 'EDR', nameEn: 'EDR', slug: 'edr' },
    orderId: 'order-1',
    productId: 'prod-1',
    status: 'active',
    activatedAt: new Date('2026-01-01'),
    expiresAt: null,
    email: 'user@test.cyna',
    createdAt: new Date('2026-01-01'),
    // Internal fields that MUST NOT appear in the public response:
    userId: 'user-1',
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('LicenseController', () => {
  let controller: LicenseController;
  let paymentClient: { send: jest.Mock };

  beforeEach(async () => {
    paymentClient = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicenseController],
      providers: [{ provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(LicenseController);
  });

  describe('getMyLicenses', () => {
    it('forwards userId from req.user to the payment service and strips internal fields', async () => {
      const rawLicense = buildRawLicense();
      paymentClient.send.mockReturnValueOnce(of([rawLicense]));

      const req = buildRequest('user-1');
      const result = await controller.getMyLicenses(req);

      expect(paymentClient.send).toHaveBeenCalledWith(expect.any(Object), {
        userId: 'user-1',
      });
      expect(result).toHaveLength(1);
      // Whitelisted public fields present
      expect(result[0].id).toBe('lic-1');
      expect(result[0].licenseKey).toBe('CYNA-XXXX-YYYY-ZZZZ-WWWW');
      expect(result[0].productSnapshot).toEqual({ nameFr: 'EDR', nameEn: 'EDR', slug: 'edr' });
      // Internal fields stripped (defense-in-depth)
      expect(result[0]).not.toHaveProperty('userId');
      expect(result[0]).not.toHaveProperty('updatedAt');
    });

    it('maps RPC error to HttpException with the original statusCode', async () => {
      paymentClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 500, message: 'DB down' })),
      );

      const req = buildRequest('user-1');

      await expect(controller.getMyLicenses(req)).rejects.toBeInstanceOf(HttpException);

      paymentClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 500, message: 'DB down' })),
      );
      await expect(controller.getMyLicenses(req)).rejects.toMatchObject({
        response: 'DB down',
        status: 500,
      });
    });
  });

  describe('getLicenseById', () => {
    it('forwards licenseId and userId and strips internal fields from the response', async () => {
      const rawLicense = buildRawLicense();
      paymentClient.send.mockReturnValueOnce(of(rawLicense));

      const req = buildRequest('user-1');
      const result = await controller.getLicenseById('lic-1', req);

      expect(paymentClient.send).toHaveBeenCalledWith(expect.any(Object), {
        licenseId: 'lic-1',
        userId: 'user-1',
      });
      expect(result.id).toBe('lic-1');
      expect(result.licenseKey).toBe('CYNA-XXXX-YYYY-ZZZZ-WWWW');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('updatedAt');
    });

    it('maps an RPC 404 error to an HttpException with status 404', async () => {
      paymentClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 404, message: 'License not found' })),
      );

      const req = buildRequest('user-1');

      try {
        await controller.getLicenseById('lic-1', req);
        fail('expected HttpException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(404);
      }
    });
  });
});
