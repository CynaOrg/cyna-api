import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CynaLoggerService } from '../logger';
import { getRedisClient, getKeyvNamespace } from './cache.utils';

/**
 * CYNA Cache Service
 * Provides high-level caching operations with logging and error handling
 */
@Injectable()
export class CynaCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly logger: CynaLoggerService,
  ) {}

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Cached value or undefined if not found
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value !== undefined && value !== null) {
        this.logger.debug(`Cache HIT: ${key}`);
      } else {
        this.logger.debug(`Cache MISS: ${key}`);
      }
      return value ?? undefined;
    } catch (error) {
      this.logger.warn(`Cache GET error for key ${key}: ${error}`);
      return undefined;
    }
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional, uses default if not provided)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl ? ttl * 1000 : undefined);
      this.logger.debug(`Cache SET: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
    } catch (error) {
      this.logger.warn(`Cache SET error for key ${key}: ${error}`);
    }
  }

  /**
   * Delete a value from cache
   * @param key Cache key
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache DEL error for key ${key}: ${error}`);
    }
  }

  /**
   * Delete multiple values from cache by pattern
   * Note: Pattern-based deletion requires Redis store with keys() support
   * @param pattern Pattern to match keys (e.g., "product:*")
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      const client = getRedisClient(this.cacheManager);

      if (!client || typeof client.scanStream !== 'function' || typeof client.del !== 'function') {
        this.logger.debug(`Cache DEL by pattern not supported for current store: ${pattern}`);
        return;
      }

      // Keyv prefixes every cached key with `${namespace}:` (default "keyv:") in
      // the underlying Redis. Both the SCAN match pattern and DEL targets must
      // use the prefixed form, otherwise nothing is matched/removed.
      const namespace = getKeyvNamespace(this.cacheManager);
      const prefixedPattern = `${namespace}:${pattern}`;

      const stream = client.scanStream({ match: prefixedPattern, count: 100 });
      let total = 0;
      for await (const keys of stream) {
        if (keys.length === 0) continue;
        // Delete via the raw ioredis client to bypass Keyv's re-prefixing.
        await client.del(...keys);
        total += keys.length;
      }
      this.logger.debug(`Cache DEL by pattern: ${pattern} (${total} keys)`);
    } catch (error) {
      this.logger.warn(`Cache DEL by pattern error for ${pattern}: ${error}`);
    }
  }

  /**
   * Get or set a value in cache (cache-aside pattern)
   * @param key Cache key
   * @param factory Function to generate the value if not cached
   * @param ttl Time to live in seconds (optional)
   * @returns Cached or newly generated value
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate all cache entries for a specific domain
   * @param prefix Cache prefix (e.g., "product:", "category:")
   */
  async invalidateDomain(prefix: string): Promise<void> {
    await this.delByPattern(`${prefix}*`);
    this.logger.log(`Cache invalidated for domain: ${prefix}`);
  }

  /**
   * Reset all cache
   * Note: Uses clear() method which is available in cache-manager v7+
   */
  async reset(): Promise<void> {
    try {
      const extended = this.cacheManager as unknown as { clear?: () => Promise<void> };
      if (typeof extended.clear === 'function') {
        await extended.clear();
        this.logger.log('Cache cleared');
      } else {
        this.logger.debug('Cache reset not supported for current store');
      }
    } catch (error) {
      this.logger.warn(`Cache reset error: ${error}`);
    }
  }
}
