import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { SubscriptionController } from './subscription.controller';
import { JwtAuthGuard } from '../auth/guards';

const buildReq = (id = 'u1') => ({ user: { id, email: 'x@y.z', type: 'user' } }) as never;

describe('SubscriptionController (user)', () => {
  let controller: SubscriptionController;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [{ provide: SERVICE_NAMES.PAYMENT, useValue: client }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SubscriptionController);
  });

  it('POST / forwards productId, billingPeriod and billingAddress', async () => {
    client.send.mockReturnValue(of({ id: 'sub1' }));
    await controller.createSubscription(
      { productId: 'p1', billingPeriod: 'monthly', billingAddress: { line1: 'X' } } as never,
      buildReq(),
    );
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.CREATE_SUBSCRIPTION, {
      userId: 'u1',
      productId: 'p1',
      billingPeriod: 'monthly',
      billingAddress: { line1: 'X' },
    });
  });

  it('POST / maps TimeoutError to 503', async () => {
    client.send.mockReturnValue(throwError(() => new TimeoutError()));
    try {
      await controller.createSubscription({} as never, buildReq());
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(503);
    }
  });

  it('GET / forwards userId', async () => {
    client.send.mockReturnValue(of([]));
    await controller.getSubscriptions(buildReq());
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS, {
      userId: 'u1',
    });
  });

  it('GET /:id forwards subscriptionId', async () => {
    client.send.mockReturnValue(of({ id: 'sub1' }));
    await controller.getSubscription('sub1', buildReq());
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION, {
      subscriptionId: 'sub1',
    });
  });

  it('GET /:id maps RPC error to HttpException with status', async () => {
    client.send.mockReturnValue(throwError(() => ({ statusCode: 404, message: 'Not found' })));
    try {
      await controller.getSubscription('sub1', buildReq());
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    }
  });

  it('POST /:id/cancel forwards full payload (default cancelAtPeriodEnd=true)', async () => {
    client.send.mockReturnValue(of({}));
    await controller.cancelSubscription('sub1', {} as never, buildReq());
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION, {
      subscriptionId: 'sub1',
      actor: 'user',
      userId: 'u1',
      cancelAtPeriodEnd: true,
    });
  });

  it('POST /:id/cancel respects explicit cancelAtPeriodEnd=false', async () => {
    client.send.mockReturnValue(of({}));
    await controller.cancelSubscription('sub1', { cancelAtPeriodEnd: false } as never, buildReq());
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION,
      expect.objectContaining({ cancelAtPeriodEnd: false }),
    );
  });

  it('rpcToHttpError defaults to 500 when payload is unknown', async () => {
    client.send.mockReturnValue(throwError(() => ({})));
    try {
      await controller.getSubscriptions(buildReq());
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(500);
    }
  });
});
