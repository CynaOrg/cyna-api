import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@cyna-api/common';

export const ADMIN_ROLES_KEY = 'adminRoles';

/**
 * Restrict an admin endpoint to specific AdminRole values.
 * Used with AdminRolesGuard. When omitted, the guard falls back to
 * allowing any authenticated admin.
 */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
