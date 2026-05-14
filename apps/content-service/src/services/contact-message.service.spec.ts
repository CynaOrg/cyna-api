import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { ContactMessageService } from './contact-message.service';
import { ContactMessage } from '../entities';

describe('ContactMessageService', () => {
  let service: ContactMessageService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let logger: { log: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    repo = {
      create: jest.fn((dto) => ({ ...dto, id: 'm1' })),
      save: jest.fn((x) => Promise.resolve(x)),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    logger = { log: jest.fn(), warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactMessageService,
        { provide: getRepositoryToken(ContactMessage), useValue: repo },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();
    service = module.get(ContactMessageService);
  });

  it('create persists and returns message', async () => {
    const r = await service.create({
      name: 'n',
      email: 'e@x',
      subject: 's',
      message: 'm',
    } as never);
    expect(repo.save).toHaveBeenCalled();
    expect(r.id).toBe('m1');
  });

  it('findAll uses default page/limit and returns meta', async () => {
    qb.getManyAndCount.mockResolvedValue([[{ id: 'm1' }], 1]);
    const r = await service.findAll({} as never);
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(r).toEqual({ data: [{ id: 'm1' }], meta: { total: 1, page: 1, limit: 10 } });
  });

  it('findAll applies isRead and isProcessed filters', async () => {
    await service.findAll({ page: 2, limit: 5, isRead: true, isProcessed: false } as never);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('is_read'), { isRead: true });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('is_processed'), {
      isProcessed: false,
    });
    expect(qb.skip).toHaveBeenCalledWith(5);
  });

  it('update modifies fields', async () => {
    repo.findOne.mockResolvedValue({ id: 'm1', isRead: false });
    await service.update('m1', { isRead: true } as never);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isRead: true }));
  });

  it('update throws when not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update('x', {} as never)).rejects.toBeInstanceOf(RpcException);
  });

  it('delete removes message', async () => {
    repo.findOne.mockResolvedValue({ id: 'm1' });
    await service.delete('m1');
    expect(repo.remove).toHaveBeenCalled();
  });

  it('delete throws when not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.delete('x')).rejects.toBeInstanceOf(RpcException);
  });
});
