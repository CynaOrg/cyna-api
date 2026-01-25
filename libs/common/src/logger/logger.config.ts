import * as winston from 'winston';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

/**
 * Custom log format for development (pretty print)
 */
const devFormat = printf(({ level, message, timestamp, context, correlationId, ...meta }) => {
  const correlationStr = correlationId ? ` [${correlationId}]` : '';
  const contextStr = context ? ` [${context}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp}${correlationStr}${contextStr} ${level}: ${message}${metaStr}`;
});

/**
 * Create Winston format based on environment
 */
export const createWinstonFormat = (format: 'json' | 'pretty' = 'json') => {
  if (format === 'pretty') {
    return combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      colorize({ all: true }),
      devFormat,
    );
  }

  return combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    json(),
  );
};

/**
 * Create Winston transports
 */
export const createWinstonTransports = (level: string = 'debug') => [
  new winston.transports.Console({
    level,
  }),
];

/**
 * Log levels mapping
 */
export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};
