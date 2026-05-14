import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, CynaCacheService } from '@cyna-api/common';
import { CarouselService } from './carousel.service';
import { CarouselSlide } from '../entities';

describe('CarouselService', () => {
  let service: CarouselService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let cache: {
    getOrSet: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
  };
  let logger: { log: jest.Mock; warn: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'gen' })),
      save: jest.fn((x) => Promise.resolve(x)),
      remove: jest.fn(),
    };
    cache = {
      getOrSet: jest.fn((_k, fn) => fn()),
      del: jest.fn(),
      delByPattern: jest.fn(),
    };
    logger = { log: jest.fn(), warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarouselService,
        { provide: getRepositoryToken(CarouselSlide), useValue: repo },
        { provide: CynaLoggerService, useValue: logger },
        { provide: CynaCacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(CarouselService);
  });

  it('findAllPublic uses cache and queries active slides ordered', async () => {
    repo.find.mockResolvedValue([{ id: '1' }]);
    const r = await service.findAllPublic();
    expect(repo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });
    expect(r).toEqual([{ id: '1' }]);
  });

  it('findAllAdmin returns all ordered', async () => {
    repo.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    await service.findAllAdmin();
    expect(repo.find).toHaveBeenCalledWith({ order: { displayOrder: 'ASC' } });
  });

  it('create persists slide with defaults and invalidates cache', async () => {
    const r = await service.create({ titleFr: 't', imageUrl: 'i' } as never);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayOrder: 0, isActive: true }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalled();
    expect(r).toBeDefined();
  });

  it('create respects displayOrder=0 and isActive=false values', async () => {
    await service.create({
      titleFr: 't',
      imageUrl: 'i',
      displayOrder: 5,
      isActive: false,
    } as never);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayOrder: 5, isActive: false }),
    );
  });

  it('update modifies and saves slide', async () => {
    repo.findOne.mockResolvedValue({ id: 'a', titleFr: 'old' });
    await service.update('a', { titleFr: 'new' } as never);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', titleFr: 'new' }));
  });

  it('update throws RpcException when slide not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update('x', {} as never)).rejects.toBeInstanceOf(RpcException);
  });

  it('delete removes slide and invalidates cache', async () => {
    repo.findOne.mockResolvedValue({ id: 'a' });
    await service.delete('a');
    expect(repo.remove).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalled();
  });

  it('delete throws when not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.delete('x')).rejects.toBeInstanceOf(RpcException);
  });

  it('reorder updates displayOrder per index', async () => {
    repo.find.mockResolvedValueOnce([
      { id: 'a', displayOrder: 0 },
      { id: 'b', displayOrder: 1 },
    ]);
    repo.find.mockResolvedValueOnce([
      { id: 'b', displayOrder: 0 },
      { id: 'a', displayOrder: 1 },
    ]);
    await service.reorder(['b', 'a']);
    expect(repo.save).toHaveBeenCalled();
  });

  it('reorder throws when count mismatch', async () => {
    repo.find.mockResolvedValue([{ id: 'a' }]);
    await expect(service.reorder(['a', 'b'])).rejects.toBeInstanceOf(RpcException);
  });
});
