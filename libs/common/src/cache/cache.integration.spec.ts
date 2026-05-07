import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CynaCacheModule } from './cache.module';
import { CynaCacheService } from './cache.service';
import { RedisHealthService } from './cache.health';
import { LoggerModule } from '../logger';
import configuration from '../config/configuration';

const REDIS_URL = process.env.REDIS_INTEGRATION_TEST_URL;

(REDIS_URL ? describe : describe.skip)('CynaCacheModule (integration)', () => {
  let cache: CynaCacheService;
  let health: RedisHealthService;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  beforeAll(async () => {
    process.env.REDIS_URL = REDIS_URL;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
        LoggerModule,
        CynaCacheModule.forRoot(),
      ],
    }).compile();

    cache = moduleRef.get(CynaCacheService);
    health = moduleRef.get(RedisHealthService);
  }, 30000);

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await moduleRef.close();
  }, 10000);

  it('reports status up via probe', async () => {
    const result = await health.probe();
    expect(result.status).toBe('up');
    expect(result.store).toBe('redis');
  });

  it('SET / GET / DEL roundtrip', async () => {
    await cache.set('it:key', { hello: 'world' }, 30);
    await expect(cache.get('it:key')).resolves.toEqual({ hello: 'world' });
    await cache.del('it:key');
    await expect(cache.get('it:key')).resolves.toBeUndefined();
  });

  it('delByPattern removes all matching keys via SCAN, leaves others alone', async () => {
    await cache.set('it:scan:1', 'a', 30);
    await cache.set('it:scan:2', 'b', 30);
    await cache.set('it:other', 'c', 30);

    await cache.delByPattern('it:scan:*');

    await expect(cache.get('it:scan:1')).resolves.toBeUndefined();
    await expect(cache.get('it:scan:2')).resolves.toBeUndefined();
    await expect(cache.get('it:other')).resolves.toBe('c');

    await cache.del('it:other');
  }, 15000);
});
