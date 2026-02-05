import { DynamicModule, Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-store';
import { CynaCacheService } from './cache.service';
import { LoggerModule } from '../logger';

/**
 * Cache Module Options
 */
export interface CynaCacheModuleOptions {
  /**
   * Custom TTL in seconds (overrides config)
   */
  ttl?: number;
  /**
   * Whether to use local memory cache as fallback
   */
  useMemoryFallback?: boolean;
}

/**
 * CYNA Cache Module
 * Provides Redis-based caching with NestJS Cache Manager
 * Supports both root configuration and feature-specific setup
 */
@Global()
@Module({})
export class CynaCacheModule {
  /**
   * Configure the root cache module with Redis
   * Should be imported once in the root application module
   */
  static forRoot(options?: CynaCacheModuleOptions): DynamicModule {
    return {
      module: CynaCacheModule,
      imports: [
        LoggerModule,
        CacheModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const redisHost = configService.get<string>('redis.host') || 'localhost';
            const redisPort = configService.get<number>('redis.port') || 6379;
            const defaultTtl = options?.ttl || configService.get<number>('redis.ttl') || 3600;

            try {
              const store = await redisStore({
                socket: {
                  host: redisHost,
                  port: redisPort,
                },
                ttl: defaultTtl,
              });

              console.log(`[CynaCacheModule] Connected to Redis at ${redisHost}:${redisPort}`);

              return {
                store: store as unknown as any,
                ttl: defaultTtl,
              };
            } catch (error) {
              // Fallback to in-memory cache if Redis connection fails
              if (options?.useMemoryFallback) {
                console.warn(
                  `[CynaCacheModule] Redis connection failed, using in-memory cache: ${error}`,
                );
                return {
                  ttl: defaultTtl,
                };
              }
              throw error;
            }
          },
          inject: [ConfigService],
        }),
      ],
      providers: [CynaCacheService],
      exports: [CacheModule, CynaCacheService],
    };
  }

  /**
   * Register cache module for a specific feature
   * Useful when you need different TTL configurations per module
   */
  static forFeature(options?: CynaCacheModuleOptions): DynamicModule {
    return {
      module: CynaCacheModule,
      imports: [
        LoggerModule,
        CacheModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const redisHost = configService.get<string>('redis.host') || 'localhost';
            const redisPort = configService.get<number>('redis.port') || 6379;
            const defaultTtl = options?.ttl || configService.get<number>('redis.ttl') || 3600;

            try {
              const store = await redisStore({
                socket: {
                  host: redisHost,
                  port: redisPort,
                },
                ttl: defaultTtl,
              });

              return {
                store: store as unknown as any,
                ttl: defaultTtl,
              };
            } catch (error) {
              if (options?.useMemoryFallback) {
                return {
                  ttl: defaultTtl,
                };
              }
              throw error;
            }
          },
          inject: [ConfigService],
        }),
      ],
      providers: [CynaCacheService],
      exports: [CacheModule, CynaCacheService],
    };
  }
}
