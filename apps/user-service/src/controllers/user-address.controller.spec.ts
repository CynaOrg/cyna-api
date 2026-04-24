import { Test, TestingModule } from '@nestjs/testing';
import { UserAddressController } from './user-address.controller';
import { UserAddressService } from '../services/user-address.service';

describe('UserAddressController', () => {
  let controller: UserAddressController;
  let service: jest.Mocked<UserAddressService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAddressController],
      providers: [
        {
          provide: UserAddressService,
          useValue: {
            list: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UserAddressController);
    service = module.get(UserAddressService);
  });

  it('list forwards userId to the service', async () => {
    service.list.mockResolvedValue([]);
    await controller.list({ userId: 'u1' });
    expect(service.list).toHaveBeenCalledWith('u1');
  });

  it('create splits userId from payload and forwards dto', async () => {
    service.create.mockResolvedValue({} as any);
    await controller.create({ userId: 'u1', label: 'L' } as any);
    expect(service.create).toHaveBeenCalledWith('u1', { label: 'L' });
  });

  it('update splits userId and id from payload and forwards dto', async () => {
    service.update.mockResolvedValue({} as any);
    await controller.update({ userId: 'u1', id: 'a1', label: 'X' } as any);
    expect(service.update).toHaveBeenCalledWith('u1', 'a1', { label: 'X' });
  });

  it('delete forwards userId and id', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.delete({ userId: 'u1', id: 'a1' });
    expect(service.delete).toHaveBeenCalledWith('u1', 'a1');
  });
});
