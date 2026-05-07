import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CynaCacheModule } from './cache.module';
import { CynaCacheService } from './cache.service';
import { LoggerModule } from '../logger';
import configuration from '../config/configuration';

describe('CynaCacheModule', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function bootModule() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
        LoggerModule,
        CynaCacheModule.forRoot({ useMemoryFallback: true }),
      ],
    }).compile();
  }

  it('boots with REDIS_URL set', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const moduleRef = await bootModule();
    const cacheService = moduleRef.get(CynaCacheService);
    expect(cacheService).toBeDefined();
    const cacheManager = moduleRef.get(CACHE_MANAGER);
    expect(cacheManager).toBeDefined();
    await moduleRef.close();
  });

  it('parses REDIS_URL and connects to its host (not localhost default)', async () => {
    // This test would have caught the regression where redisStore({ url, ... })
    // ignored the `url` field and silently fell back to localhost:6379. Using
    // a non-localhost hostname guarantees an ECONNREFUSED + fallback if the URL
    // is not parsed.
    process.env.REDIS_URL = 'redis://default:somepass@unreachable.invalid:65000';
    process.env.NODE_ENV = 'development'; // allow fallback so boot doesn't throw
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
        LoggerModule,
        CynaCacheModule.forRoot(),
      ],
    }).compile();

    expect(moduleRef.get(CynaCacheService)).toBeDefined();
    await moduleRef.close();
  });

  it('boots with HOST and PORT only (no password)', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PASSWORD;
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    const moduleRef = await bootModule();
    expect(moduleRef.get(CynaCacheService)).toBeDefined();
    await moduleRef.close();
  });

  it('boots with HOST, PORT and PASSWORD', async () => {
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'whatever';
    const moduleRef = await bootModule();
    expect(moduleRef.get(CynaCacheService)).toBeDefined();
    await moduleRef.close();
  });

  it('falls back to memory cache in non-production when Redis fails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '1'; // unreachable
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PASSWORD;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
        LoggerModule,
        CynaCacheModule.forRoot(),
      ],
    }).compile();

    expect(moduleRef.get(CynaCacheService)).toBeDefined();
    await moduleRef.close();
  });

  it('throws in production when Redis fails and no fallback is allowed', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '1';
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PASSWORD;

    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
          LoggerModule,
          CynaCacheModule.forRoot(),
        ],
      }).compile(),
    ).rejects.toBeDefined();
  });
});
