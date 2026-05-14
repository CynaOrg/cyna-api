import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '@cyna-api/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const SECRET = 'optional-jwt-secret';

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

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    guard = new OptionalJwtAuthGuard(configService as unknown as ConfigService);
  });

  it('should set request.user and return true for valid token', () => {
    const token = signTestToken({
      sub: 'u-1',
      email: 'g@cyna.io',
      type: 'user',
      role: 'customer',
    });
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
    const token = jwt.sign({ sub: 'u-1', email: 'g@cyna.io', type: 'user' }, 'wrong-secret', {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should return true with user undefined when token is expired (silent fail)', () => {
    const token = signTestToken(
      { sub: 'u-1', email: 'g@cyna.io', type: 'user' },
      { expiresIn: '-1h' },
    );
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
    const token = signTestToken({ sub: 'u-1', email: 'g@cyna.io', type: 'user' });
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

  it('should log and pass through (guest) on unexpected error from jwt.verify', () => {
    // Simulate an unexpected non-JWT error during verification path.
    const verifySpy = jest.spyOn(jwt, 'verify').mockImplementationOnce(() => {
      const e = new Error('unexpected internal failure');
      e.name = 'WeirdError';
      throw e;
    });
    const token = signTestToken({ sub: 'u-1', email: 'g@cyna.io', type: 'user' });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = buildContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toBeUndefined();
    verifySpy.mockRestore();
  });
});
