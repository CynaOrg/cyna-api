/**
 * Decide whether TypeORM `synchronize` is allowed in the current environment.
 *
 * Returns `true` only when ALL of the following hold:
 * - `NODE_ENV` is not `production`
 * - no Railway environment marker is set (`RAILWAY_ENVIRONMENT_NAME` / `RAILWAY_ENVIRONMENT`)
 * - the explicit opt-in `DATABASE_SYNC=true` is present
 *
 * The Railway check is the belt-and-suspenders defence: a `.env` accidentally
 * shipped with `DATABASE_SYNC=true` cannot trigger schema rewrites in any
 * Railway environment, even one that forgot to set `NODE_ENV=production`.
 */
export const isDatabaseSyncEnabled = (): boolean => {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.RAILWAY_ENVIRONMENT_NAME) return false;
  if (process.env.RAILWAY_ENVIRONMENT) return false;
  return process.env.DATABASE_SYNC === 'true';
};
