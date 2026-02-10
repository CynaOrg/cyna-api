import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * SessionId Decorator
 * Extracts the X-Session-Id header from the request
 */
export const SessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-session-id'];
  },
);
