import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { createWinstonFormat, createWinstonTransports } from './logger.config';
import { getCorrelationId, getRequestContext } from './correlation-id.context';

export interface HttpLogData {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip?: string;
  userId?: string;
}

export interface RabbitMQLogData {
  pattern: string | object;
  queue?: string;
  exchange?: string;
  routingKey?: string;
  correlationId?: string;
  duration?: number;
}

export interface BusinessLogData {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  details?: Record<string, unknown>;
}

/**
 * CynaLoggerService
 * Custom logger service with structured logging and correlation ID support
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CynaLoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor(private readonly configService: ConfigService) {
    const logLevel = this.configService.get<string>('LOG_LEVEL', 'debug');
    const logFormat = this.configService.get<string>('LOG_FORMAT', 'json') as 'json' | 'pretty';

    this.logger = winston.createLogger({
      format: createWinstonFormat(logFormat),
      transports: createWinstonTransports(logLevel),
    });
  }

  /**
   * Set context for this logger instance
   */
  setContext(context: string): this {
    this.context = context;
    return this;
  }

  /**
   * Get enriched metadata with correlation ID
   */
  private getEnrichedMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
    const requestContext = getRequestContext();
    return {
      ...meta,
      context: this.context,
      correlationId: requestContext?.correlationId || getCorrelationId(),
      ...(requestContext?.userId && { userId: requestContext.userId }),
    };
  }

  // Standard logging methods

  log(message: string, ...optionalParams: unknown[]): void {
    const meta = typeof optionalParams[0] === 'object' ? optionalParams[0] : {};
    this.logger.info(message, this.getEnrichedMeta(meta as Record<string, unknown>));
  }

  error(message: string, trace?: string, ...optionalParams: unknown[]): void {
    const meta = typeof optionalParams[0] === 'object' ? optionalParams[0] : {};
    this.logger.error(message, {
      ...this.getEnrichedMeta(meta as Record<string, unknown>),
      ...(trace && { stack: trace }),
    });
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    const meta = typeof optionalParams[0] === 'object' ? optionalParams[0] : {};
    this.logger.warn(message, this.getEnrichedMeta(meta as Record<string, unknown>));
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    const meta = typeof optionalParams[0] === 'object' ? optionalParams[0] : {};
    this.logger.debug(message, this.getEnrichedMeta(meta as Record<string, unknown>));
  }

  verbose(message: string, ...optionalParams: unknown[]): void {
    const meta = typeof optionalParams[0] === 'object' ? optionalParams[0] : {};
    this.logger.verbose(message, this.getEnrichedMeta(meta as Record<string, unknown>));
  }

  // HTTP logging

  /**
   * Log HTTP request/response
   */
  logHttpRequest(data: HttpLogData): void {
    const level = data.statusCode >= 500 ? 'error' : data.statusCode >= 400 ? 'warn' : 'http';

    this.logger.log(level, `${data.method} ${data.url} ${data.statusCode} ${data.responseTime}ms`, {
      ...this.getEnrichedMeta(),
      type: 'http',
      ...data,
    });
  }

  // RabbitMQ logging

  /**
   * Log message sent to a microservice
   */
  logMessageSent(pattern: string | object, data: RabbitMQLogData): void {
    const patternStr = typeof pattern === 'object' ? JSON.stringify(pattern) : pattern;
    this.logger.info(`Message sent: ${patternStr}`, {
      ...this.getEnrichedMeta(),
      type: 'rabbitmq_message_sent',
      ...data,
    });
  }

  /**
   * Log message received from a microservice
   */
  logMessageReceived(pattern: string | object, data: RabbitMQLogData): void {
    const patternStr = typeof pattern === 'object' ? JSON.stringify(pattern) : pattern;
    this.logger.info(`Message received: ${patternStr}`, {
      ...this.getEnrichedMeta(),
      type: 'rabbitmq_message_received',
      ...data,
    });
  }

  /**
   * Log event published to RabbitMQ
   */
  logEventPublished(eventType: string, data: RabbitMQLogData): void {
    this.logger.info(`Event published: ${eventType}`, {
      ...this.getEnrichedMeta(),
      type: 'rabbitmq_event_published',
      ...data,
    });
  }

  /**
   * Log event consumed from RabbitMQ
   */
  logEventConsumed(eventType: string, data: RabbitMQLogData): void {
    this.logger.info(`Event consumed: ${eventType}`, {
      ...this.getEnrichedMeta(),
      type: 'rabbitmq_event_consumed',
      ...data,
    });
  }

  // Business logging

  /**
   * Log business action (audit trail)
   */
  logBusinessAction(data: BusinessLogData): void {
    const message = data.entityId
      ? `${data.action} ${data.entity} [${data.entityId}]`
      : `${data.action} ${data.entity}`;

    this.logger.info(message, {
      ...this.getEnrichedMeta(),
      type: 'business_action',
      ...data,
    });
  }
}
