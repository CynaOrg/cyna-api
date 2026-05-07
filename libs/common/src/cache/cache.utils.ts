import { Cache } from 'cache-manager';

/**
 * Minimal subset of the ioredis client surface we use:
 * - `scanStream` for non-blocking pattern deletion
 * - `ping` for health probes (also used at boot in cache.module)
 * - `status` for connection state checks
 */
export interface IoredisLikeClient {
  status?: string;
  ping?: () => Promise<string>;
  scanStream?: (opts: { match: string; count: number }) => AsyncIterable<string[]>;
}

/**
 * Walks the cache-manager v7 internals to retrieve the underlying ioredis
 * client when the Redis store is in use:
 *
 *   Cache → stores[0] (Keyv) → opts.store (KeyvAdapter) → _cache (RedisStore) → client (ioredis)
 *
 * Returns undefined when the cache is using an in-memory fallback (no Redis client).
 */
export function getRedisClient(cacheManager: Cache): IoredisLikeClient | undefined {
  const stores = (cacheManager as unknown as { stores?: unknown[] }).stores;
  if (!Array.isArray(stores) || stores.length === 0) return undefined;

  const keyv = stores[0] as { opts?: { store?: unknown } } | undefined;
  const adapter = keyv?.opts?.store as { _cache?: { client?: IoredisLikeClient } } | undefined;
  return adapter?._cache?.client;
}
