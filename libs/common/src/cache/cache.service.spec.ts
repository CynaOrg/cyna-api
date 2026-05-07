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
    stores?: unknown[];
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
    it('scans with the namespace-prefixed pattern and deletes via the ioredis client', async () => {
      const stream = (async function* () {
        yield ['keyv:product:1', 'keyv:product:2'];
        yield ['keyv:product:3'];
      })();
      const client = {
        scanStream: jest.fn(() => stream),
        del: jest.fn().mockResolvedValue(1),
      };
      // Mock the cache-manager v7 structure: stores[0] is a Keyv with namespace
      // and stores[0].opts.store._cache.client holds the ioredis client.
      cacheManager.stores = [
        {
          _namespace: 'keyv',
          opts: { namespace: 'keyv', store: { _cache: { client } } },
        },
      ];

      await service.delByPattern('product:*');

      expect(client.scanStream).toHaveBeenCalledWith({
        match: 'keyv:product:*',
        count: 100,
      });
      // First batch: 2 keys → one del call with both
      // Second batch: 1 key → one del call with one
      expect(client.del).toHaveBeenCalledTimes(2);
      expect(client.del).toHaveBeenNthCalledWith(1, 'keyv:product:1', 'keyv:product:2');
      expect(client.del).toHaveBeenNthCalledWith(2, 'keyv:product:3');
      // We do NOT route through cacheManager.del — that would re-prefix.
      expect(cacheManager.del).not.toHaveBeenCalled();
    });

    it('logs a debug message when scan is unsupported', async () => {
      // No stores → memory mode → no client
      cacheManager.stores = [];
      await service.delByPattern('product:*');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache DEL by pattern not supported'),
      );
      expect(cacheManager.del).not.toHaveBeenCalled();
    });
  });
});
