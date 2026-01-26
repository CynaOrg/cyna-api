import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../interfaces';

/**
 * CurrentUser Decorator
 * Extracts the current user from the request
 *
 * Usage:
 * @CurrentUser() user: RequestUser - Get the full user object
 * @CurrentUser('id') userId: string - Get a specific property
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user) return undefined;

    return data ? user[data] : user;
  },
);
