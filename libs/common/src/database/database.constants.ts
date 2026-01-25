/**
 * Database Constants
 * Contains constant values used across the database module
 */

/**
 * Default database connection name
 */
export const DEFAULT_CONNECTION_NAME = 'default';

/**
 * Database connection names for each microservice
 */
export const DATABASE_CONNECTIONS = {
  AUTH: 'auth',
  USER: 'user',
  CATALOG: 'catalog',
  ORDER: 'order',
  PAYMENT: 'payment',
  NOTIFICATION: 'notification',
  CONTENT: 'content',
  ANALYTICS: 'analytics',
} as const;

/**
 * TypeORM naming strategy conventions
 */
export const NAMING_CONVENTIONS = {
  TABLE_PREFIX: '',
  COLUMN_PREFIX: '',
} as const;
