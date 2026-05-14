import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { UserAdminController } from './user-admin.controller';
import { SuperAdminGuard } from '../auth/guards';

describe('Gateway UserAdminController', () => {
  let controller: UserAdminController;
  let userClient: { send: jest.Mock };
  let orderClient: { send: jest.Mock };

  beforeEach(async () => {
    userClient = { send: jest.fn().mockReturnValue(of([])) };
    orderClient = { send: jest.fn().mockReturnValue(of([])) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAdminController],
      providers: [
        { provide: SERVICE_NAMES.USER, useValue: userClient },
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
      ],
    })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(UserAdminController);
  });

  describe('findAll', () => {
    it('forwards query with mapped isActive when status=active', async () => {
      userClient.send.mockReturnValue(of([{ id: 'u1' }]));
      await controller.findAll({ page: 2, limit: 10, status: 'active' } as never);
      expect(userClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.USER.ADMIN_LIST,
        expect.objectContaining({ page: 2, limit: 10, isActive: true }),
      );
    });

    it('maps status=inactive to isActive=false', async () => {
      userClient.send.mockReturnValue(of([]));
      await controller.findAll({ status: 'inactive' } as never);
      expect(userClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.USER.ADMIN_LIST,
        expect.objectContaining({ isActive: false }),
      );
    });

    it('omits isActive when status is undefined', async () => {
      userClient.send.mockReturnValue(of([]));
      await controller.findAll({ search: 'tom' } as never);
      const arg = userClient.send.mock.calls[0][1];
      expect(arg.isActive).toBeUndefined();
      expect(arg.search).toBe('tom');
    });
  });

  it('findOne sends ADMIN_GET with userId', async () => {
    userClient.send.mockReturnValue(of({ id: 'u1' }));
    const r = await controller.findOne('u1');
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.ADMIN_GET, { userId: 'u1' });
    expect(r).toEqual({ id: 'u1' });
  });

  it('updateStatus sends ADMIN_UPDATE_STATUS payload', async () => {
    userClient.send.mockReturnValue(of({ id: 'u1', isActive: false }));
    await controller.updateStatus('u1', { isActive: false } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.ADMIN_UPDATE_STATUS, {
      userId: 'u1',
      isActive: false,
    });
  });

  describe('sendMessage error handling', () => {
    it('maps TimeoutError to 503', async () => {
      userClient.send.mockReturnValue(throwError(() => new TimeoutError()));
      await expect(controller.findOne('u1')).rejects.toMatchObject({ status: 503 });
    });

    it('maps RpcException-like error to HttpException', async () => {
      userClient.send.mockReturnValue(
        throwError(() => ({ statusCode: 404, message: 'nf', code: 'NF' })),
      );
      await expect(controller.findOne('u1')).rejects.toMatchObject({ status: 404 });
    });

    it('rethrows unknown errors', async () => {
      userClient.send.mockReturnValue(throwError(() => new Error('boom')));
      await expect(controller.findOne('u1')).rejects.toThrow('boom');
    });
  });

  describe('getUserOrders', () => {
    it('forwards userId and pagination', async () => {
      orderClient.send.mockReturnValue(of([{ id: 'o1' }]));
      const r = await controller.getUserOrders('u1', { page: 2, limit: 5 } as never);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS, {
        userId: 'u1',
        page: 2,
        limit: 5,
      });
      expect(r).toEqual([{ id: 'o1' }]);
    });

    it('maps order client timeout to 503', async () => {
      orderClient.send.mockReturnValue(throwError(() => new TimeoutError()));
      await expect(controller.getUserOrders('u1', {} as never)).rejects.toMatchObject({
        status: 503,
      });
    });

    it('rethrows other order client errors', async () => {
      orderClient.send.mockReturnValue(throwError(() => new Error('x')));
      await expect(controller.getUserOrders('u1', {} as never)).rejects.toThrow('x');
    });
  });
});
