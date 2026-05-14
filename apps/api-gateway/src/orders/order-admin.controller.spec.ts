import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { OrderAdminController } from './order-admin.controller';
import { AdminRolesGuard, SuperAdminGuard } from '../auth/guards';

describe('OrderAdminController', () => {
  let controller: OrderAdminController;
  let orderClient: { send: jest.Mock };

  beforeEach(async () => {
    orderClient = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderAdminController],
      providers: [{ provide: SERVICE_NAMES.ORDER, useValue: orderClient }],
    })
      .overrideGuard(AdminRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OrderAdminController);
  });

  it('getOrders forwards full query', async () => {
    orderClient.send.mockReturnValue(of({ data: [], total: 0 }));
    await controller.getOrders({ page: 1, limit: 10 } as never);
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS, {
      page: 1,
      limit: 10,
    });
  });

  it('getOrders maps TimeoutError -> 503 HttpException', async () => {
    orderClient.send.mockReturnValue(throwError(() => new TimeoutError()));
    try {
      await controller.getOrders({} as never);
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(503);
    }
  });

  it('getOrders maps RPC nested-message error to HttpException with status', async () => {
    orderClient.send.mockReturnValue(
      throwError(() => ({ message: { statusCode: 422, message: 'bad' } })),
    );
    try {
      await controller.getOrders({} as never);
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    }
  });

  it('getOrders defaults to 500 when no statusCode', async () => {
    orderClient.send.mockReturnValue(throwError(() => ({ foo: 'bar' })));
    try {
      await controller.getOrders({} as never);
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(500);
    }
  });

  it('getOrder forwards orderId', async () => {
    orderClient.send.mockReturnValue(of({ id: 'o1' }));
    await controller.getOrder('o1');
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_ORDER, {
      orderId: 'o1',
    });
  });

  it('updateOrderStatus forwards full body', async () => {
    orderClient.send.mockReturnValue(of({ id: 'o1', status: 'SHIPPED' }));
    await controller.updateOrderStatus('o1', {
      status: 'SHIPPED',
      notes: 'sent',
      trackingNumber: 'T1',
      trackingUrl: 'https://t',
    } as never);
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.ADMIN_UPDATE_STATUS, {
      orderId: 'o1',
      status: 'SHIPPED',
      notes: 'sent',
      trackingNumber: 'T1',
      trackingUrl: 'https://t',
    });
  });
});
