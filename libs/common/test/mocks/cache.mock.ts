export const createMockCacheService = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn().mockResolvedValue(undefined),
  wrap: jest.fn(async <T>(_key: string, fn: () => Promise<T>) => fn()),
  store: {
    keys: jest.fn().mockResolvedValue([]),
  },
});

export type MockCacheService = ReturnType<typeof createMockCacheService>;

export const createMockRedisClient = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  incr: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
});
