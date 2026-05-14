import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { OrderGatewayController } from './order.controller';
import { JwtAuthGuard } from '../auth/guards';

const buildReq = (id = 'u1') => ({ user: { id, email: 'x@y.z', type: 'user' } }) as never;

describe('OrderGatewayController', () => {
  let controller: OrderGatewayController;
  let orderClient: { send: jest.Mock };

  beforeEach(async () => {
    orderClient = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderGatewayController],
      providers: [{ provide: SERVICE_NAMES.ORDER, useValue: orderClient }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OrderGatewayController);
  });

  it('getOrders forwards userId', async () => {
    orderClient.send.mockReturnValue(of([{ id: 'o1' }]));
    const r = await controller.getOrders(buildReq());
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_ORDERS, {
      userId: 'u1',
    });
    expect(r).toEqual([{ id: 'o1' }]);
  });

  it('getOrders maps TimeoutError to 503', async () => {
    orderClient.send.mockReturnValue(throwError(() => new TimeoutError()));
    await expect(controller.getOrders(buildReq())).rejects.toMatchObject({
      statusCode: 503,
      message: 'Order service timeout',
    });
  });

  it('getOrders re-throws non-timeout errors', async () => {
    orderClient.send.mockReturnValue(throwError(() => new Error('boom')));
    await expect(controller.getOrders(buildReq())).rejects.toThrow('boom');
  });

  it('getOrder forwards orderId and userId', async () => {
    orderClient.send.mockReturnValue(of({ id: 'o1' }));
    const r = await controller.getOrder('o1', buildReq());
    expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_ORDER, {
      orderId: 'o1',
      userId: 'u1',
    });
    expect(r).toEqual({ id: 'o1' });
  });

  it('getOrder maps timeout', async () => {
    orderClient.send.mockReturnValue(throwError(() => new TimeoutError()));
    await expect(controller.getOrder('o1', buildReq())).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
