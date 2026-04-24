import { Test, TestingModule } from '@nestjs/testing';
import { UserAdminController } from './user-admin.controller';
import { UserAdminService } from '../services/user-admin.service';

describe('UserAdminController', () => {
  let controller: UserAdminController;
  let service: jest.Mocked<UserAdminService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAdminController],
      providers: [
        {
          provide: UserAdminService,
          useValue: {
            adminList: jest.fn(),
            adminGet: jest.fn(),
            adminUpdateStatus: jest.fn(),
          },
        },
      ],
    }).compile();
    controller = module.get(UserAdminController);
    service = module.get(UserAdminService);
  });

  it('adminList delegates to service', async () => {
    service.adminList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    await controller.adminList({ page: 1, limit: 10 });
    expect(service.adminList).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('adminGet delegates', async () => {
    await controller.adminGet({ userId: 'u1' });
    expect(service.adminGet).toHaveBeenCalledWith('u1');
  });

  it('adminUpdateStatus delegates', async () => {
    await controller.adminUpdateStatus({ userId: 'u1', isActive: false });
    expect(service.adminUpdateStatus).toHaveBeenCalledWith('u1', { isActive: false });
  });
});
