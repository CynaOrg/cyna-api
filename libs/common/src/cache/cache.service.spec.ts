import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CynaCacheService } from './cache.service';
import { CynaLoggerService } from '../logger';

describe('CynaCacheService', () => {
  let service: CynaCacheService;
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    store?: any;
    clear?: jest.Mock;
  };
  let logger: { debug: jest.Mock; warn: jest.Mock; log: jest.Mock };

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    logger = { debug: jest.fn(), warn: jest.fn(), log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CynaCacheService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(CynaCacheService);
  });

  describe('get', () => {
    it('returns the cached value when present', async () => {
      cacheManager.get.mockResolvedValue('hit');
      await expect(service.get<string>('k')).resolves.toBe('hit');
      expect(logger.debug).toHaveBeenCalledWith('Cache HIT: k');
    });

    it('returns undefined on miss', async () => {
      cacheManager.get.mockResolvedValue(null);
      await expect(service.get('k')).resolves.toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith('Cache MISS: k');
    });

    it('returns undefined on error', async () => {
      cacheManager.get.mockRejectedValue(new Error('boom'));
      await expect(service.get('k')).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('passes ttl in milliseconds when ttl seconds is provided', async () => {
      await service.set('k', 'v', 30);
      expect(cacheManager.set).toHaveBeenCalledWith('k', 'v', 30000);
    });

    it('omits ttl when not provided', async () => {
      await service.set('k', 'v');
      expect(cacheManager.set).toHaveBeenCalledWith('k', 'v', undefined);
    });
  });

  describe('del', () => {
    it('calls cacheManager.del', async () => {
      await service.del('k');
      expect(cacheManager.del).toHaveBeenCalledWith('k');
    });
  });

  describe('getOrSet', () => {
    it('returns cached value without calling factory', async () => {
      cacheManager.get.mockResolvedValue('cached');
      const factory = jest.fn();
      await expect(service.getOrSet('k', factory)).resolves.toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls factory and sets value on miss', async () => {
      cacheManager.get.mockResolvedValue(null);
      const factory = jest.fn().mockResolvedValue('fresh');
      await expect(service.getOrSet('k', factory, 10)).resolves.toBe('fresh');
      expect(factory).toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalledWith('k', 'fresh', 10000);
    });
  });

  describe('delByPattern', () => {
    it('uses scanStream when available on the underlying ioredis client', async () => {
      const stream = (async function* () {
        yield ['product:1', 'product:2'];
        yield ['product:3'];
      })();
      const client = { scanStream: jest.fn(() => stream) };
      cacheManager.store = { client };

      await service.delByPattern('product:*');

      expect(client.scanStream).toHaveBeenCalledWith({ match: 'product:*', count: 100 });
      expect(cacheManager.del).toHaveBeenCalledTimes(3);
    });

    it('logs a debug message when scan is unsupported', async () => {
      cacheManager.store = {};
      await service.delByPattern('product:*');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache DEL by pattern not supported'),
      );
      expect(cacheManager.del).not.toHaveBeenCalled();
    });
  });
});
