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
    it('forwards userId from req.user to the payment service', async () => {
      const licenses = [{ id: 'lic-1', licenseKey: 'CYNA-XXXX' }];
      paymentClient.send.mockReturnValueOnce(of(licenses));

      const req = buildRequest('user-1');
      const result = await controller.getMyLicenses(req);

      expect(result).toEqual(licenses);
      expect(paymentClient.send).toHaveBeenCalledWith(expect.any(Object), {
        userId: 'user-1',
      });
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
    it('forwards licenseId and userId to the payment service', async () => {
      const license = { id: 'lic-1', licenseKey: 'CYNA-XXXX' };
      paymentClient.send.mockReturnValueOnce(of(license));

      const req = buildRequest('user-1');
      const result = await controller.getLicenseById('lic-1', req);

      expect(result).toEqual(license);
      expect(paymentClient.send).toHaveBeenCalledWith(expect.any(Object), {
        licenseId: 'lic-1',
        userId: 'user-1',
      });
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
