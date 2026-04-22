import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PaymentController } from './payment.controller';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { LicenseService } from '../services/license.service';

describe('PaymentController', () => {
  let controller: PaymentController;

  const paymentService = {
    createPaymentIntent: jest.fn(),
    createSubscription: jest.fn(),
    getSubscriptionsForUser: jest.fn(),
  };

  const subscriptionService = {
    cancel: jest.fn(),
    findById: jest.fn(),
    cancelAllForCustomer: jest.fn(),
  };

  const licenseService = {
    findByUserId: jest.fn(),
    findByIdForUser: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: paymentService },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: LicenseService, useValue: licenseService },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserLicenses', () => {
    it('should return licenses for the user', async () => {
      const mockLicenses = [{ id: 'lic-1' }, { id: 'lic-2' }];
      licenseService.findByUserId.mockResolvedValueOnce(mockLicenses);
      const result = await controller.getUserLicenses({ userId: 'user-1' });
      expect(result).toBe(mockLicenses);
      expect(licenseService.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should wrap service errors in RpcException', async () => {
      licenseService.findByUserId.mockRejectedValueOnce(new Error('DB down'));
      await expect(controller.getUserLicenses({ userId: 'user-1' })).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });

  describe('getLicenseById', () => {
    it('should return license when found', async () => {
      const mockLicense = { id: 'lic-1', userId: 'user-1' };
      licenseService.findByIdForUser.mockResolvedValueOnce(mockLicense);
      const result = await controller.getLicenseById({
        licenseId: 'lic-1',
        userId: 'user-1',
      });
      expect(result).toBe(mockLicense);
      expect(licenseService.findByIdForUser).toHaveBeenCalledWith('lic-1', 'user-1');
    });

    it('should propagate NotFoundException as RpcException with statusCode 404', async () => {
      licenseService.findByIdForUser.mockRejectedValueOnce(
        new NotFoundException('License not found'),
      );
      try {
        await controller.getLicenseById({ licenseId: 'lic-1', userId: 'user-1' });
        fail('expected RpcException');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        const rpcError = (err as RpcException).getError() as { statusCode: number };
        expect(rpcError.statusCode).toBe(404);
      }
    });
  });

  describe('handleAccountDeleted - license revocation', () => {
    it('should revoke all user licenses', async () => {
      licenseService.revokeAllForUser.mockResolvedValueOnce(2);
      await controller.handleAccountDeleted({ userId: 'user-1' });
      expect(licenseService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('should not throw when revocation returns 0 (idempotent)', async () => {
      licenseService.revokeAllForUser.mockResolvedValueOnce(0);
      await expect(controller.handleAccountDeleted({ userId: 'user-1' })).resolves.not.toThrow();
    });

    it('should log LICENSE_REVOCATION_FAILED when revocation throws', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      licenseService.revokeAllForUser.mockRejectedValueOnce(new Error('DB down'));
      await expect(controller.handleAccountDeleted({ userId: 'user-1' })).resolves.not.toThrow();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('LICENSE_REVOCATION_FAILED'),
        expect.anything(),
        'PaymentController',
      );
      logSpy.mockRestore();
    });

    it('should still revoke licenses when subscription cancellation fails (isolated try/catch)', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      subscriptionService.cancelAllForCustomer.mockRejectedValueOnce(new Error('Stripe down'));
      licenseService.revokeAllForUser.mockResolvedValueOnce(3);
      await controller.handleAccountDeleted({
        userId: 'user-1',
        stripeCustomerId: 'cus_XYZ',
      });
      expect(licenseService.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUBSCRIPTION_CANCELLATION_FAILED'),
        expect.anything(),
        'PaymentController',
      );
      logSpy.mockRestore();
    });
  });
});
