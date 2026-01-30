import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
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
    reflector: Reflector,
  ) {
    super(configService, reflector);
  }

  canActivate(context: ExecutionContext): boolean {
    // 1. Run parent JWT validation
    const result = super.canActivate(context);
    if (!result) return false;

    // 2. Check if user is admin
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (user?.type !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
