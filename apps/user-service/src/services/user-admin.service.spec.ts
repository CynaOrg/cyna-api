import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { UserAdminService } from './user-admin.service';
import { User } from '../entities/user.entity';
import { CynaLoggerService } from '@cyna-api/common';

describe('UserAdminService', () => {
  let service: UserAdminService;
  let userRepository: jest.Mocked<Repository<User>>;
  let qb: jest.Mocked<SelectQueryBuilder<User>>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<User>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: CynaLoggerService, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(UserAdminService);
    userRepository = module.get(getRepositoryToken(User));
  });

  it('adminList returns paginated users', async () => {
    qb.getManyAndCount.mockResolvedValue([[{ id: 'u1' } as User], 1]);
    const res = await service.adminList({ page: 1, limit: 10 });
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it('adminGet throws 404 when not found', async () => {
    userRepository.findOne.mockResolvedValue(null);
    await expect(service.adminGet('missing')).rejects.toThrow(RpcException);
  });

  it('adminGet returns user when found', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'u1', email: 'a@b.c' } as User);
    const res = await service.adminGet('u1');
    expect(res.id).toBe('u1');
  });

  it('adminUpdateStatus updates isActive and returns user', async () => {
    const user = { id: 'u1', isActive: true } as User;
    userRepository.findOne.mockResolvedValue(user);
    userRepository.save.mockResolvedValue({ ...user, isActive: false } as User);
    const res = await service.adminUpdateStatus('u1', { isActive: false });
    expect(res.isActive).toBe(false);
  });
});
