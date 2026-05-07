import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CynaCacheService } from './cache.service';
import { RedisHealthService } from './cache.health';
import { LoggerModule } from '../logger';

export interface CynaCacheModuleOptions {
  /** Custom TTL in seconds (overrides config). */
  ttl?: number;
  /**
   * Whether to fall back to in-memory cache if Redis is unreachable.
   * Default: true outside production, false in production.
   */
  useMemoryFallback?: boolean;
}

@Global()
@Module({})
export class CynaCacheModule {
  static forRoot(options?: CynaCacheModuleOptions): DynamicModule {
    return CynaCacheModule.build(options);
  }

  static forFeature(options?: CynaCacheModuleOptions): DynamicModule {
    return CynaCacheModule.build(options);
  }

  private static build(options?: CynaCacheModuleOptions): DynamicModule {
    const logger = new Logger('CynaCacheModule');

    return {
      module: CynaCacheModule,
      imports: [
        LoggerModule,
        CacheModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const env =
              configService.get<string>('app.env') || process.env.NODE_ENV || 'development';
            const allowFallback = options?.useMemoryFallback ?? env !== 'production';
            const defaultTtlSeconds =
              options?.ttl ?? configService.get<number>('redis.ttl') ?? 3600;
            const defaultTtlMs = defaultTtlSeconds * 1000;

            const url = configService.get<string>('redis.url');
            const host = configService.get<string>('redis.host') || 'localhost';
            const port = configService.get<number>('redis.port') || 6379;
            const password = configService.get<string>('redis.password') || undefined;

            // ioredis is lazy by default and surfaces connection errors via async events.
            // These options force fail-fast behavior so unreachable Redis throws here.
            const ioredisOptions = {
              maxRetriesPerRequest: 1,
              enableOfflineQueue: false,
              connectTimeout: 5000,
              ttl: defaultTtlMs,
            };

            try {
              const store = url
                ? await redisStore({ url, ...ioredisOptions })
                : await redisStore({ host, port, password, ...ioredisOptions });

              // Probe the connection so failures throw synchronously rather than
              // being silently swallowed by ioredis' background reconnect loop.
              const client = (store as unknown as { client?: { ping?: () => Promise<string> } })
                .client;
              if (client?.ping) {
                await client.ping();
              }

              const target = url ? new URL(url).host : `${host}:${port}`;
              logger.log(`Connected to Redis at ${target}`);

              return {
                store: store as unknown as string,
                ttl: defaultTtlMs,
              };
            } catch (error) {
              if (allowFallback) {
                logger.warn(
                  `Redis connection failed, using in-memory cache: ${(error as Error).message}`,
                );
                return { ttl: defaultTtlMs };
              }
              logger.error(
                `Redis connection failed in production (no fallback): ${(error as Error).message}`,
              );
              throw error;
            }
          },
          inject: [ConfigService],
        }),
      ],
      providers: [CynaCacheService, RedisHealthService],
      exports: [CacheModule, CynaCacheService, RedisHealthService],
    };
  }
}
