import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import {
  AdminRole,
  IS_PUBLIC_KEY,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TokenInvalidException,
} from '@cyna-api/common';
import { AdminRolesGuard } from './admin-roles.guard';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';

const SECRET = 'admin-roles-test-secret';

const signTestToken = (payload: Record<string, unknown>, overrides: jwt.SignOptions = {}) =>
  jwt.sign(payload, SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...overrides,
  });

const buildContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('AdminRolesGuard', () => {
  let guard: AdminRolesGuard;
  let configService: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  /**
   * Returns a getAllAndOverride implementation that returns:
   *  - false for IS_PUBLIC_KEY (auth not skipped)
   *  - the supplied roles list for ADMIN_ROLES_KEY
   */
  const reflectorImpl = (allowedRoles: AdminRole[] | undefined) => (key: string) => {
    if (key === IS_PUBLIC_KEY) return false;
    if (key === ADMIN_ROLES_KEY) return allowedRoles;
    return undefined;
  };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new AdminRolesGuard(
      configService as unknown as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  it('should allow access when admin role is in allowed roles', () => {
    reflector.getAllAndOverride.mockImplementation(
      reflectorImpl([AdminRole.COMMERCIAL, AdminRole.SUPER_ADMIN]),
    );

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.COMMERCIAL,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when admin role is not in allowed roles', () => {
    reflector.getAllAndOverride.mockImplementation(reflectorImpl([AdminRole.SUPER_ADMIN]));

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.COMMERCIAL,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Insufficient admin role');
  });

  it('should throw ForbiddenException when user has no role field', () => {
    reflector.getAllAndOverride.mockImplementation(reflectorImpl([AdminRole.COMMERCIAL]));

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      // no role field
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access when no @AdminRoles() metadata is set', () => {
    reflector.getAllAndOverride.mockImplementation(reflectorImpl(undefined));

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.COMMERCIAL,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when @AdminRoles() is an empty array', () => {
    reflector.getAllAndOverride.mockImplementation(reflectorImpl([]));

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.COMMERCIAL,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject non-admin token via parent guard', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const token = signTestToken({
      sub: 'user-1',
      email: 'user@cyna.io',
      type: 'user',
      role: 'customer',
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject missing token via parent guard', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const ctx = buildContext({ headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
  });

  it('should reflect ADMIN_ROLES_KEY via reflector', () => {
    reflector.getAllAndOverride.mockImplementation(reflectorImpl([AdminRole.SUPER_ADMIN]));

    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.SUPER_ADMIN,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ADMIN_ROLES_KEY, expect.any(Array));
  });
});
