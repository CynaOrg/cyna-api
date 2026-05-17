import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import {
  SubscriptionAdminController,
  SubscriptionActionEnum,
} from './subscription-admin.controller';
import { AdminRolesGuard, SuperAdminGuard } from '../auth/guards';

describe('SubscriptionAdminController', () => {
  let controller: SubscriptionAdminController;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionAdminController],
      providers: [{ provide: SERVICE_NAMES.PAYMENT, useValue: client }],
    })
      .overrideGuard(AdminRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SubscriptionAdminController);
  });

  it('GET / passes adminMode and pagination', async () => {
    client.send.mockReturnValue(of({ data: [], total: 0 }));
    await controller.findAll({ status: 'ACTIVE', page: 2, limit: 50 } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS, {
      adminMode: true,
      status: 'ACTIVE',
      page: 2,
      limit: 50,
    });
  });

  it('GET /:id forwards subscriptionId', async () => {
    client.send.mockReturnValue(of({ id: 's1' }));
    await controller.findOne('s1');
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION, {
      subscriptionId: 's1',
    });
  });

  describe('updateStatus', () => {
    it('CANCEL routes to CANCEL_SUBSCRIPTION', async () => {
      client.send.mockReturnValue(of({ ok: true }));
      await controller.updateStatus('s1', { action: SubscriptionActionEnum.CANCEL });
      expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION, {
        subscriptionId: 's1',
        actor: 'admin',
        cancelAtPeriodEnd: false,
      });
    });

    it('REACTIVATE routes to REACTIVATE_SUBSCRIPTION', async () => {
      client.send.mockReturnValue(of({ ok: true }));
      await controller.updateStatus('s1', { action: SubscriptionActionEnum.REACTIVATE });
      expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.REACTIVATE_SUBSCRIPTION, {
        subscriptionId: 's1',
        actor: 'admin',
      });
    });

    it('PAUSE returns 501 (not implemented)', async () => {
      try {
        await controller.updateStatus('s1', { action: SubscriptionActionEnum.PAUSE });
        fail('should throw');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(501);
      }
    });
  });

  describe('updateTerms', () => {
    it('rejects when no field provided', async () => {
      try {
        await controller.updateTerms('s1', {});
        fail('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(400);
      }
    });

    it('forwards cancelAtPeriodEnd', async () => {
      client.send.mockReturnValue(of({}));
      await controller.updateTerms('s1', { cancelAtPeriodEnd: true });
      expect(client.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.PAYMENT.ADMIN_UPDATE_SUBSCRIPTION_TERMS,
        { subscriptionId: 's1', cancelAtPeriodEnd: true, trialEnd: undefined },
      );
    });

    it("forwards trialEnd='now'", async () => {
      client.send.mockReturnValue(of({}));
      await controller.updateTerms('s1', { trialEnd: 'now' });
      expect(client.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.PAYMENT.ADMIN_UPDATE_SUBSCRIPTION_TERMS,
        { subscriptionId: 's1', cancelAtPeriodEnd: undefined, trialEnd: 'now' },
      );
    });

    it('forwards numeric trialEnd timestamp', async () => {
      client.send.mockReturnValue(of({}));
      await controller.updateTerms('s1', { trialEnd: 1234567890 });
      expect(client.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.PAYMENT.ADMIN_UPDATE_SUBSCRIPTION_TERMS,
        expect.objectContaining({ trialEnd: 1234567890 }),
      );
    });

    it('maps RPC error to HttpException', async () => {
      client.send.mockReturnValue(
        throwError(() => ({ statusCode: 404, message: 'Sub not found' })),
      );
      try {
        await controller.updateTerms('s1', { cancelAtPeriodEnd: true });
        fail('should throw');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(404);
      }
    });
  });
});
