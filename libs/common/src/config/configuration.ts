/**
 * Application Configuration Factory
 * Centralizes all environment variables into a typed configuration object
 */

export interface AppConfiguration {
  app: {
    name: string;
    port: number;
    env: string;
    apiPrefix: string;
    apiVersion: string;
  };
  swagger: {
    enabled: boolean;
    path: string;
  };
  logging: {
    level: string;
    format: string;
  };
  i18n: {
    defaultLanguage: string;
    fallbackLanguage: string;
  };
  rabbitmq: {
    url: string;
  };
  cors: {
    origins: string[];
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
  };
  redis: {
    url?: string;
    host: string;
    port: number;
    password?: string;
    ttl: number;
  };
}

export default (): AppConfiguration => ({
  app: {
    name: process.env.APP_NAME || 'cyna-api',
    port: parseInt(process.env.APP_PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    apiPrefix: process.env.API_PREFIX || 'api',
    apiVersion: process.env.API_VERSION || 'v1',
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED === 'true',
    path: process.env.SWAGGER_PATH || 'docs',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'json',
  },
  i18n: {
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'fr',
    fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:4200').split(','),
  },
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'cyna',
    password: process.env.DATABASE_PASSWORD || 'cyna_dev',
    database: process.env.DATABASE_NAME || 'cyna_db',
    synchronize: process.env.DATABASE_SYNC === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
  },
  redis: {
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
  },
});
