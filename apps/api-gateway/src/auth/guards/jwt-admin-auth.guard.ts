import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@cyna-api/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequestUser } from '../interfaces';

/**
 * JWT Admin Auth Guard
 * Extends JwtAuthGuard to additionally verify admin access
 */
@Injectable()
export class JwtAdminAuthGuard extends JwtAuthGuard implements CanActivate {
  constructor(
    configService: ConfigService,
    private readonly _reflector: Reflector,
  ) {
    super(configService, _reflector);
  }

  canActivate(context: ExecutionContext): boolean {
    // 1. Check @Public() decorator — skip all checks for public routes
    const isPublic = this._reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Run parent JWT validation
    const result = super.canActivate(context);
    if (!result) return false;

    // 3. Check if user is admin
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (user?.type !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
