import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CynaLoggerService, CynaCacheService } from '@cyna-api/common';
import { HeroTextService } from './hero-text.service';
import { HeroText } from '../entities';

describe('HeroTextService', () => {
  let service: HeroTextService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let cache: { getOrSet: jest.Mock; del: jest.Mock };
  let logger: { log: jest.Mock; debug: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'h1' })),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    cache = { getOrSet: jest.fn((_k, fn) => fn()), del: jest.fn() };
    logger = { log: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeroTextService,
        { provide: getRepositoryToken(HeroText), useValue: repo },
        { provide: CynaLoggerService, useValue: logger },
        { provide: CynaCacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(HeroTextService);
  });

  it('get returns existing hero text', async () => {
    repo.findOne.mockResolvedValue({ id: 'h1', titleFr: 'a' });
    const r = await service.get();
    expect(r).toMatchObject({ id: 'h1' });
  });

  it('get returns default when none exists', async () => {
    repo.findOne.mockResolvedValue(null);
    const r = await service.get();
    expect(repo.create).toHaveBeenCalled();
    expect(r.titleFr).toBeDefined();
  });

  it('update creates when none exists with defaults', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.update({ titleFr: 'X' } as never);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ titleFr: 'X', titleEn: expect.any(String) }),
    );
    expect(cache.del).toHaveBeenCalled();
  });

  it('update partially updates only provided fields', async () => {
    const existing = {
      id: 'h1',
      titleFr: 'origFR',
      titleEn: 'origEN',
      subtitleFr: 'sFR',
      subtitleEn: 'sEN',
    };
    repo.findOne.mockResolvedValue(existing);
    await service.update({ titleEn: 'newEN', subtitleFr: 'newSFR' } as never);
    expect(existing.titleFr).toBe('origFR');
    expect(existing.titleEn).toBe('newEN');
    expect(existing.subtitleFr).toBe('newSFR');
    expect(existing.subtitleEn).toBe('sEN');
  });
});
