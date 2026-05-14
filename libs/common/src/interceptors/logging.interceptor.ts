import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { getCorrelationId } from '@cyna-api/common/logger';

/**
 * Logging Interceptor
 * Logs request/response details for all HTTP requests
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const correlationId = getCorrelationId();
    const startTime = Date.now();

    // Redact query strings that may contain PII/secrets. If any query key
    // matches a sensitive pattern, log only the path (drops `?…`) — otherwise
    // log the full URL so debugging stays useful.
    const SENSITIVE_QUERY_KEY = /email|password|token|code|secret|key/i;
    const queryKeys = request.query ? Object.keys(request.query) : [];
    const hasSensitiveQuery = queryKeys.some((k) => SENSITIVE_QUERY_KEY.test(k));
    const safeUrl = hasSensitiveQuery ? request.path : url;

    this.logger.debug(`Incoming ${method} ${safeUrl}`, {
      correlationId,
      ip,
      userAgent: userAgent.substring(0, 100),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(`${method} ${safeUrl} ${statusCode} ${responseTime}ms`, {
            correlationId,
            method,
            url: safeUrl,
            statusCode,
            responseTime,
            ip,
          });
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.warn(
            `${method} ${safeUrl} ${statusCode} ${responseTime}ms - ${error.message}`,
            {
              correlationId,
              method,
              url: safeUrl,
              statusCode,
              responseTime,
              ip,
              error: error.message,
            },
          );
        },
      }),
    );
  }
}
