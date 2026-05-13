import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { TokenInvalidException } from '@cyna-api/common';
import { JwtAdminAuthGuard } from './jwt-admin-auth.guard';

const SECRET = 'admin-test-secret';

const buildContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('JwtAdminAuthGuard', () => {
  let guard: JwtAdminAuthGuard;
  let configService: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAdminAuthGuard(
      configService as unknown as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  it('should return true for valid admin token', () => {
    const token = jwt.sign(
      { sub: 'admin-1', email: 'admin@cyna.io', type: 'admin', role: 'super_admin' },
      SECRET,
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({ id: 'admin-1', type: 'admin', role: 'super_admin' }),
    );
  });

  it('should throw ForbiddenException for valid user token with type=user', () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'user@cyna.io', type: 'user', role: 'customer' },
      SECRET,
    );
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException with message "Admin access required"', () => {
    const token = jwt.sign({ sub: 'u', email: 'u@u.com', type: 'user' }, SECRET);
    const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

    expect(() => guard.canActivate(ctx)).toThrow('Admin access required');
  });

  it('should throw TokenInvalidException when token is absent', () => {
    const ctx = buildContext({ headers: {} });

    expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
  });

  it('should throw TokenInvalidException when token is invalid', () => {
    const ctx = buildContext({ headers: { authorization: 'Bearer garbage' } });

    expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
  });

  it('should skip all auth checks on @Public() route', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = buildContext({ headers: {} });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
