/**
 * Extra coverage for PaymentController: exercises every MessagePattern handler
 * happy path + its `wrapError` branch so we keep the contract tested even
 * when the underlying service mocks are trivial.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { NotFoundException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { LicenseService } from '../services/license.service';

describe('PaymentController (extra coverage)', () => {
  let controller: PaymentController;
  const paymentService = {
    createPaymentIntent: jest.fn(),
    retrievePaymentIntent: jest.fn(),
    createSubscription: jest.fn(),
    getSubscriptionsForUser: jest.fn(),
  };
  const subscriptionService = {
    cancel: jest.fn(),
    findById: jest.fn(),
    cancelAllForCustomer: jest.fn(),
    adminUpdateTerms: jest.fn(),
  };
  const licenseService = {
    findByUserId: jest.fn(),
    findByIdForUser: jest.fn(),
    revokeAllForUser: jest.fn(),
    activate: jest.fn(),
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

  afterEach(() => jest.clearAllMocks());

  describe('createPaymentIntent', () => {
    it('returns the service result on success', async () => {
      paymentService.createPaymentIntent.mockResolvedValueOnce({
        clientSecret: 's',
        paymentIntentId: 'pi',
      });
      const result = await controller.createPaymentIntent({
        orderId: '1',
        amount: 10,
      } as never);
      expect(result).toEqual({ clientSecret: 's', paymentIntentId: 'pi' });
    });

    it('wraps unknown errors in RpcException with PAYMENT_SERVICE_ERROR 500', async () => {
      paymentService.createPaymentIntent.mockRejectedValueOnce(new Error('boom'));
      try {
        await controller.createPaymentIntent({} as never);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('PAYMENT_SERVICE_ERROR');
        expect(rpcError.statusCode).toBe(500);
      }
    });

    it('passes through RpcException unchanged', async () => {
      const rpc = new RpcException({ statusCode: 422, message: 'bad', code: 'X' });
      paymentService.createPaymentIntent.mockRejectedValueOnce(rpc);
      await expect(controller.createPaymentIntent({} as never)).rejects.toBe(rpc);
    });

    it('uses "Unknown payment service error" when non-Error thrown', async () => {
      paymentService.createPaymentIntent.mockRejectedValueOnce('weird');
      try {
        await controller.createPaymentIntent({} as never);
        fail();
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.message).toBe('Unknown payment service error');
      }
    });
  });

  describe('retrievePaymentIntent', () => {
    it('delegates and returns', async () => {
      paymentService.retrievePaymentIntent.mockResolvedValueOnce({ id: 'pi_1' });
      const result = await controller.retrievePaymentIntent({ paymentIntentId: 'pi_1' });
      expect(result).toEqual({ id: 'pi_1' });
      expect(paymentService.retrievePaymentIntent).toHaveBeenCalledWith('pi_1');
    });

    it('wraps service errors', async () => {
      paymentService.retrievePaymentIntent.mockRejectedValueOnce(new Error('boom'));
      await expect(
        controller.retrievePaymentIntent({ paymentIntentId: 'pi_1' }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('createSubscription', () => {
    it('delegates to paymentService.createSubscription', async () => {
      paymentService.createSubscription.mockResolvedValueOnce({
        subscriptionId: 'sub-1',
      });
      const result = await controller.createSubscription({} as never);
      expect(result).toEqual({ subscriptionId: 'sub-1' });
    });

    it('preserves HttpException status (NotFoundException → 404 RpcException)', async () => {
      paymentService.createSubscription.mockRejectedValueOnce(new NotFoundException('nope'));
      try {
        await controller.createSubscription({} as never);
        fail();
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.statusCode).toBe(404);
      }
    });
  });

  describe('getSubscriptions', () => {
    it('forwards adminMode + status + page + limit + fetchAll', async () => {
      paymentService.getSubscriptionsForUser.mockResolvedValueOnce({ data: [], total: 0 });
      await controller.getSubscriptions({
        userId: 'u',
        adminMode: true,
        page: 2,
        limit: 10,
        fetchAll: true,
      } as never);
      expect(paymentService.getSubscriptionsForUser).toHaveBeenCalledWith('u', {
        adminMode: true,
        status: undefined,
        page: 2,
        limit: 10,
        fetchAll: true,
      });
    });

    it('coerces adminMode and fetchAll to strict boolean false when missing', async () => {
      paymentService.getSubscriptionsForUser.mockResolvedValueOnce([]);
      await controller.getSubscriptions({ userId: 'u' } as never);
      expect(paymentService.getSubscriptionsForUser).toHaveBeenCalledWith('u', {
        adminMode: false,
        status: undefined,
        page: undefined,
        limit: undefined,
        fetchAll: false,
      });
    });

    it('wraps service failure', async () => {
      paymentService.getSubscriptionsForUser.mockRejectedValueOnce(new Error('boom'));
      await expect(controller.getSubscriptions({} as never)).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('cancelSubscription', () => {
    it('defaults cancelAtPeriodEnd to true when omitted', async () => {
      subscriptionService.cancel.mockResolvedValueOnce({ id: 'sub-1' });
      await controller.cancelSubscription({
        subscriptionId: 'sub-1',
        actor: 'user',
        userId: 'u-1',
      } as never);
      expect(subscriptionService.cancel).toHaveBeenCalledWith('sub-1', 'user', 'u-1', true);
    });

    it('passes explicit cancelAtPeriodEnd=false through', async () => {
      subscriptionService.cancel.mockResolvedValueOnce({ id: 'sub-1' });
      await controller.cancelSubscription({
        subscriptionId: 'sub-1',
        actor: 'admin',
        cancelAtPeriodEnd: false,
      } as never);
      expect(subscriptionService.cancel).toHaveBeenCalledWith('sub-1', 'admin', undefined, false);
    });

    it('wraps RpcException pass-through', async () => {
      const rpc = new RpcException({ statusCode: 403, message: 'no', code: 'FORBIDDEN' });
      subscriptionService.cancel.mockRejectedValueOnce(rpc);
      await expect(controller.cancelSubscription({ subscriptionId: 's' } as never)).rejects.toBe(
        rpc,
      );
    });
  });

  describe('getSubscription', () => {
    it('delegates to subscriptionService.findById', async () => {
      subscriptionService.findById.mockResolvedValueOnce({ id: 'sub-1' });
      const result = await controller.getSubscription({ subscriptionId: 'sub-1' });
      expect(result).toEqual({ id: 'sub-1' });
    });

    it('wraps service error', async () => {
      subscriptionService.findById.mockRejectedValueOnce(new Error('db'));
      await expect(controller.getSubscription({ subscriptionId: 'sub-1' })).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });

  describe('activateLicense', () => {
    it('delegates to licenseService.activate', async () => {
      licenseService.activate.mockResolvedValueOnce({ id: 'lic-1', status: 'active' });
      const result = await controller.activateLicense({ token: 'tok' });
      expect(licenseService.activate).toHaveBeenCalledWith('tok');
      expect(result).toEqual({ id: 'lic-1', status: 'active' });
    });

    it('wraps activation failure', async () => {
      licenseService.activate.mockRejectedValueOnce(new Error('expired'));
      await expect(controller.activateLicense({ token: 'tok' })).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });

  describe('adminUpdateSubscriptionTerms', () => {
    it('forwards both terms to subscriptionService.adminUpdateTerms', async () => {
      subscriptionService.adminUpdateTerms.mockResolvedValueOnce({ id: 'sub-1' });
      const result = await controller.adminUpdateSubscriptionTerms({
        subscriptionId: 'sub-1',
        cancelAtPeriodEnd: true,
        trialEnd: 'now',
      });
      expect(subscriptionService.adminUpdateTerms).toHaveBeenCalledWith('sub-1', {
        cancelAtPeriodEnd: true,
        trialEnd: 'now',
      });
      expect(result).toEqual({ id: 'sub-1' });
    });

    it('wraps RpcException', async () => {
      const rpc = new RpcException({ statusCode: 502, message: 'boom', code: 'X' });
      subscriptionService.adminUpdateTerms.mockRejectedValueOnce(rpc);
      await expect(controller.adminUpdateSubscriptionTerms({ subscriptionId: 's' })).rejects.toBe(
        rpc,
      );
    });
  });

  describe('handleAccountDeleted — subscription side', () => {
    it('skips subscription cancellation when stripeCustomerId is absent (still revokes licenses)', async () => {
      licenseService.revokeAllForUser.mockResolvedValueOnce(0);
      await controller.handleAccountDeleted({ userId: 'u-1' });
      expect(subscriptionService.cancelAllForCustomer).not.toHaveBeenCalled();
      expect(licenseService.revokeAllForUser).toHaveBeenCalledWith('u-1');
    });

    it('cancels Stripe subscriptions when stripeCustomerId is set', async () => {
      subscriptionService.cancelAllForCustomer.mockResolvedValueOnce(2);
      licenseService.revokeAllForUser.mockResolvedValueOnce(1);
      await controller.handleAccountDeleted({ userId: 'u-1', stripeCustomerId: 'cus_1' });
      expect(subscriptionService.cancelAllForCustomer).toHaveBeenCalledWith('cus_1');
    });
  });
});
