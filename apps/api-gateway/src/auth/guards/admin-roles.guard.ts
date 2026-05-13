import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@cyna-api/common';
import { JwtAdminAuthGuard } from './jwt-admin-auth.guard';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';
import { RequestUser } from '../interfaces';

/**
 * Admin Roles Guard
 * Extends JwtAdminAuthGuard and additionally restricts access
 * to the AdminRole values listed via @AdminRoles().
 * If no @AdminRoles() metadata is set, any authenticated admin passes.
 */
@Injectable()
export class AdminRolesGuard extends JwtAdminAuthGuard implements CanActivate {
  constructor(
    configService: ConfigService,
    private readonly rolesReflector: Reflector,
  ) {
    super(configService, rolesReflector);
  }

  canActivate(context: ExecutionContext): boolean {
    const result = super.canActivate(context);
    if (!result) return false;

    const allowedRoles = this.rolesReflector.getAllAndOverride<AdminRole[] | undefined>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles || allowedRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user?.role || !allowedRoles.includes(user.role as AdminRole)) {
      throw new ForbiddenException('Insufficient admin role');
    }

    return true;
  }
}
