import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import {
  runWithContext,
  generateCorrelationId,
  RequestContext,
} from '@cyna-api/common/logger';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Correlation ID Interceptor
 * Generates or propagates correlation ID for request tracing
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Get correlation ID from header or generate new one
    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) || generateCorrelationId();

    // Set correlation ID in response header
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Create request context
    const requestContext: RequestContext = {
      correlationId,
      requestPath: request.path,
      requestMethod: request.method,
      // userId and adminId would be set by auth middleware/guard
    };

    // Run handler within context
    return new Observable((subscriber) => {
      runWithContext(requestContext, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
