import { isDatabaseSyncEnabled } from './database-safety';

describe('isDatabaseSyncEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.DATABASE_SYNC;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when NODE_ENV=production, regardless of DATABASE_SYNC', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false when RAILWAY_ENVIRONMENT_NAME is set, regardless of DATABASE_SYNC', () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false when RAILWAY_ENVIRONMENT_NAME=staging, regardless of DATABASE_SYNC', () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false when RAILWAY_ENVIRONMENT is set, regardless of DATABASE_SYNC', () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false in dev when DATABASE_SYNC is not set', () => {
    process.env.NODE_ENV = 'development';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false in dev when DATABASE_SYNC=false', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_SYNC = 'false';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns false in dev when DATABASE_SYNC is any non-"true" value', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_SYNC = '1';
    expect(isDatabaseSyncEnabled()).toBe(false);
  });

  it('returns true only in dev with explicit DATABASE_SYNC=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(true);
  });

  it('returns true when NODE_ENV is unset (test/local) with DATABASE_SYNC=true', () => {
    process.env.DATABASE_SYNC = 'true';
    expect(isDatabaseSyncEnabled()).toBe(true);
  });
});
