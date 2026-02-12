import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@cyna-api/common';
import { JwtAdminAuthGuard } from './jwt-admin-auth.guard';
import { RequestUser } from '../interfaces';

/**
 * Super Admin Guard
 * Extends JwtAdminAuthGuard to additionally verify super_admin role
 */
@Injectable()
export class SuperAdminGuard extends JwtAdminAuthGuard implements CanActivate {
  constructor(configService: ConfigService, reflector: Reflector) {
    super(configService, reflector);
  }

  canActivate(context: ExecutionContext): boolean {
    // 1. Run parent admin validation (JWT + admin type check)
    const result = super.canActivate(context);
    if (!result) return false;

    // 2. Check if admin has super_admin role
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (user?.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
