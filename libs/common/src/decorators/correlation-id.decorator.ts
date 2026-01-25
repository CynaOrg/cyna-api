import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getCorrelationId } from '@cyna-api/common/logger';

/**
 * @CorrelationId() decorator
 * Gets the current correlation ID from the request context
 *
 * Usage:
 * @Get('orders')
 * getOrders(@CorrelationId() correlationId: string) { ... }
 */
export const CorrelationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const correlationId = getCorrelationId();
    if (correlationId) {
      return correlationId;
    }

    // Fallback: try to get from request header
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-correlation-id'] || `req_${Date.now().toString(36)}`;
  },
);
