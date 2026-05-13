import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const SECRET = 'optional-jwt-secret';

const buildContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    guard = new OptionalJwtAuthGuard(configService as unknown as ConfigService);
  });

  it('should set request.user and return true for valid token', () => {
    const token = jwt.sign(
      { sub: 'u-1', email: 'g@cyna.io', type: 'user', role: 'customer' },
      SECRET,
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({
      id: 'u-1',
      email: 'g@cyna.io',
      type: 'user',
      role: 'customer',
    });
  });

  it('should return true with user undefined when no token is provided (guest)', () => {
    const request: Record<string, unknown> = { headers: {} };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should return true with user undefined when token has invalid signature (silent fail)', () => {
    const token = jwt.sign({ sub: 'u-1', email: 'g@cyna.io', type: 'user' }, 'wrong-secret');
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should return true with user undefined when token is expired (silent fail)', () => {
    const token = jwt.sign({ sub: 'u-1', email: 'g@cyna.io', type: 'user' }, SECRET, {
      expiresIn: '-1h',
    });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should return true with user undefined when token is malformed garbage', () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer not.a.jwt' },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should return true (guest) when JWT_SECRET is not configured', () => {
    configService.get.mockReturnValue(undefined);
    const token = jwt.sign({ sub: 'u-1', email: 'g@cyna.io', type: 'user' }, SECRET);
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should ignore non-Bearer auth scheme and pass through as guest', () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Basic abc' },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
