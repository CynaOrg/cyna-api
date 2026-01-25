import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
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

    this.logger.debug(`Incoming ${method} ${url}`, {
      correlationId,
      ip,
      userAgent: userAgent.substring(0, 100),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(
            `${method} ${url} ${statusCode} ${responseTime}ms`,
            {
              correlationId,
              method,
              url,
              statusCode,
              responseTime,
              ip,
            },
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.warn(
            `${method} ${url} ${statusCode} ${responseTime}ms - ${error.message}`,
            {
              correlationId,
              method,
              url,
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
