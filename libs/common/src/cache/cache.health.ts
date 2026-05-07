import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CynaLoggerService } from '../logger';
import { randomUUID } from 'crypto';
import { getRedisClient } from './cache.utils';

export interface RedisHealthResult {
  status: 'up' | 'down';
  store: 'redis' | 'memory';
  latencyMs: number;
  timestamp: string;
  error?: string;
}

@Injectable()
export class RedisHealthService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly logger: CynaLoggerService,
  ) {}

  async probe(): Promise<RedisHealthResult> {
    const key = `health:probe:${randomUUID()}`;
    const value = `ok:${Date.now()}`;
    const start = Date.now();
    const store = this.detectStore();
    const timestamp = new Date().toISOString();

    try {
      await this.cacheManager.set(key, value, 5000);
      const got = await this.cacheManager.get<string>(key);
      await this.cacheManager.del(key);

      if (got !== value) {
        return {
          status: 'down',
          store,
          latencyMs: Date.now() - start,
          timestamp,
          error: `value mismatch: expected '${value}', got '${got}'`,
        };
      }

      return {
        status: 'up',
        store,
        latencyMs: Date.now() - start,
        timestamp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis probe failed: ${message}`);
      return {
        status: 'down',
        store,
        latencyMs: Date.now() - start,
        timestamp,
        error: message,
      };
    }
  }

  private detectStore(): 'redis' | 'memory' {
    return getRedisClient(this.cacheManager) ? 'redis' : 'memory';
  }
}
