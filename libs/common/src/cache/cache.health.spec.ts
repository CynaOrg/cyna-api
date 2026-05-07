import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RedisHealthService } from './cache.health';
import { CynaLoggerService } from '../logger';

describe('RedisHealthService', () => {
  let service: RedisHealthService;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock; store?: any };

  beforeEach(async () => {
    cacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisHealthService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: CynaLoggerService,
          useValue: { debug: jest.fn(), warn: jest.fn(), log: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(RedisHealthService);
  });

  it('returns up + redis store when probe succeeds', async () => {
    cacheManager.set.mockResolvedValue(undefined);
    cacheManager.get.mockImplementation(async () => {
      // The service generates a value; we capture it via set call
      const setCall = cacheManager.set.mock.calls[0];
      return setCall ? setCall[1] : 'ok';
    });
    cacheManager.del.mockResolvedValue(undefined);
    cacheManager.store = { client: {} }; // ioredis client present → store is "redis"

    const result = await service.probe();

    expect(result.status).toBe('up');
    expect(result.store).toBe('redis');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns down when set throws', async () => {
    cacheManager.set.mockRejectedValue(new Error('NOAUTH'));
    cacheManager.store = { client: {} };

    const result = await service.probe();

    expect(result.status).toBe('down');
    expect(result.error).toContain('NOAUTH');
  });

  it('returns store=memory when no ioredis client is attached', async () => {
    cacheManager.set.mockResolvedValue(undefined);
    cacheManager.get.mockImplementation(async () => {
      const setCall = cacheManager.set.mock.calls[0];
      return setCall ? setCall[1] : 'ok';
    });
    cacheManager.del.mockResolvedValue(undefined);
    cacheManager.store = undefined;

    const result = await service.probe();

    expect(result.status).toBe('up');
    expect(result.store).toBe('memory');
  });

  it('returns down when get returns the wrong value', async () => {
    cacheManager.set.mockResolvedValue(undefined);
    cacheManager.get.mockResolvedValue('wrong');
    cacheManager.del.mockResolvedValue(undefined);
    cacheManager.store = { client: {} };

    const result = await service.probe();
    expect(result.status).toBe('down');
    expect(result.error).toContain('mismatch');
  });
});
