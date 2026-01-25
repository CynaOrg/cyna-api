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
});
