import * as Joi from 'joi';

/**
 * Environment Variables Validation Schema
 * Validates all required and optional environment variables at startup
 */
export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  APP_NAME: Joi.string().default('cyna-api'),
  APP_PORT: Joi.number().port().default(3000),

  // API Configuration
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),

  // Swagger
  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('docs'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('debug'),
  LOG_FORMAT: Joi.string().valid('json', 'pretty').default('json'),

  // i18n
  DEFAULT_LANGUAGE: Joi.string().valid('fr', 'en').default('fr'),
  FALLBACK_LANGUAGE: Joi.string().valid('fr', 'en').default('en'),

  // RabbitMQ
  RABBITMQ_URL: Joi.string().uri().default('amqp://guest:guest@localhost:5672'),

  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:4200,http://localhost:8100'),

  // PostgreSQL
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().default('cyna'),
  DATABASE_PASSWORD: Joi.string().default('cyna_dev'),
  DATABASE_NAME: Joi.string().default('cyna_db'),
  DATABASE_SYNC: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(true),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_TTL: Joi.number().integer().positive().default(3600),
}).unknown(true); // Allow other environment variables
