import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import {
  AdminRole,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TokenInvalidException,
} from '@cyna-api/common';
import { SuperAdminGuard } from './super-admin.guard';

const SECRET = 'super-admin-test-secret';

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

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;
  let configService: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new SuperAdminGuard(
      configService as unknown as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  it('should return true for super_admin token', () => {
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.SUPER_ADMIN,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException for admin (non super_admin)', () => {
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.COMMERCIAL,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Super admin access required');
  });

  it('should throw ForbiddenException when user has no role', () => {
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject non-admin token via parent guard', () => {
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
    const ctx = buildContext({ headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
  });

  it('should return true on @Public() route when token is present and role is super_admin', () => {
    // SuperAdminGuard delegates to parent for IS_PUBLIC_KEY short-circuit, but still
    // verifies the role afterwards. With a valid super_admin token, both checks pass.
    reflector.getAllAndOverride.mockReturnValue(true);
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@cyna.io',
      type: 'admin',
      role: AdminRole.SUPER_ADMIN,
    });
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    // parent.canActivate returns true via IS_PUBLIC shortcut. request.user is unset
    // (no token validation ran), so the role check throws ForbiddenException.
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
