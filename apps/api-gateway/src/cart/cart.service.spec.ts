import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, BillingPeriod } from '@cyna-api/common';
import { CartService } from './cart.service';

describe('Gateway CartService', () => {
  let service: CartService;
  let orderClient: { send: jest.Mock };

  beforeEach(async () => {
    orderClient = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CartService, { provide: SERVICE_NAMES.ORDER, useValue: orderClient }],
    }).compile();

    service = module.get(CartService);
  });

  it('getCart forwards data', async () => {
    orderClient.send.mockReturnValue(of({ items: [] }));
    const result = await service.getCart('u1');
    expect(result).toEqual({ items: [] });
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_CART, {
      userId: 'u1',
      sessionId: undefined,
    });
  });

  it('addItem forwards dto', async () => {
    orderClient.send.mockReturnValue(of({ ok: true }));
    await service.addItem('u1', undefined, { productId: 'p', quantity: 1 } as never);
    expect(orderClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM,
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('updateItem forwards data', async () => {
    orderClient.send.mockReturnValue(of({}));
    await service.updateItem(
      'u1',
      undefined,
      'p1',
      { quantity: 2 } as never,
      BillingPeriod.MONTHLY,
    );
    expect(orderClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.ORDER.UPDATE_CART_ITEM,
      expect.objectContaining({ productId: 'p1', billingPeriod: BillingPeriod.MONTHLY }),
    );
  });

  it('removeItem forwards data', async () => {
    orderClient.send.mockReturnValue(of({}));
    await service.removeItem('u1', undefined, 'p1', BillingPeriod.YEARLY);
    expect(orderClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM,
      expect.objectContaining({ productId: 'p1' }),
    );
  });

  it('clearCart forwards data', async () => {
    orderClient.send.mockReturnValue(of({}));
    await service.clearCart('u1');
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.CLEAR_CART, {
      userId: 'u1',
      sessionId: undefined,
    });
  });

  it('mergeGuestCart forwards data', async () => {
    orderClient.send.mockReturnValue(of({}));
    await service.mergeGuestCart('u1', 's1');
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART, {
      userId: 'u1',
      sessionId: 's1',
    });
  });

  describe('error handling', () => {
    it('maps RPC error with statusCode to HttpException', async () => {
      orderClient.send.mockReturnValue(
        throwError(() => ({ statusCode: 400, message: 'Bad', code: 'BAD_CART' })),
      );
      try {
        await service.getCart('u1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(400);
      }
    });

    it('falls back to 500 when statusCode missing', async () => {
      orderClient.send.mockReturnValue(throwError(() => ({ statusCode: 0, message: 'Boom' })));
      try {
        await service.getCart('u1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(500);
      }
    });

    it('maps TimeoutError to 503 SERVICE_TIMEOUT', async () => {
      const timeoutErr = new Error('Timeout');
      timeoutErr.name = 'TimeoutError';
      orderClient.send.mockReturnValue(throwError(() => timeoutErr));
      try {
        await service.getCart('u1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(503);
      }
    });

    it('maps generic Error to 500 ORDER_SERVICE_ERROR', async () => {
      orderClient.send.mockReturnValue(throwError(() => new Error('Unknown')));
      try {
        await service.getCart('u1');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(500);
      }
    });

    it('maps string error to 500', async () => {
      orderClient.send.mockReturnValue(throwError(() => 'string-err'));
      await expect(service.getCart('u1')).rejects.toBeInstanceOf(HttpException);
    });
  });
});
