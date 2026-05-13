import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { TokenExpiredException, TokenInvalidException } from '@cyna-api/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'test-secret-key-for-jwt-guard';

const buildContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let configService: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(SECRET) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAuthGuard(
      configService as unknown as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  describe('public routes', () => {
    it('should skip auth and return true when @Public() metadata is set', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = buildContext({ headers: {} });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(configService.get).not.toHaveBeenCalled();
    });
  });

  describe('with valid token in Authorization header', () => {
    it('should set request.user and return true', () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'tom@cyna.io', type: 'user', role: 'customer' },
        SECRET,
      );
      const request: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
      };
      const ctx = buildContext(request);

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(request.user).toEqual({
        id: 'user-123',
        email: 'tom@cyna.io',
        type: 'user',
        role: 'customer',
      });
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });

  describe('missing token', () => {
    it('should throw TokenInvalidException when Authorization header is absent', () => {
      const ctx = buildContext({ headers: {} });

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });

    it('should throw TokenInvalidException when headers object is missing', () => {
      const ctx = buildContext({});

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });

    it('should throw TokenInvalidException when auth scheme is not Bearer', () => {
      const ctx = buildContext({ headers: { authorization: 'Basic abc123' } });

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });
  });

  describe('expired token', () => {
    it('should throw TokenExpiredException (i18n-ready messageKey errors.auth.tokenExpired)', () => {
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', type: 'user' }, SECRET, {
        expiresIn: '-1h',
      });
      const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

      try {
        guard.canActivate(ctx);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(TokenExpiredException);
        expect((err as TokenExpiredException).messageKey).toBe('errors.auth.tokenExpired');
      }
    });
  });

  describe('invalid token signature', () => {
    it('should throw TokenInvalidException when token is signed with the wrong secret', () => {
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', type: 'user' }, 'wrong-secret');
      const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });

    it('should throw TokenInvalidException when token is malformed garbage', () => {
      const ctx = buildContext({ headers: { authorization: 'Bearer not.a.real.jwt' } });

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });
  });

  describe('JWT_SECRET configuration', () => {
    it('should call configService.get with JWT_SECRET', () => {
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', type: 'user' }, SECRET);
      const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

      guard.canActivate(ctx);

      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('should throw TokenInvalidException when JWT_SECRET is not configured', () => {
      configService.get.mockReturnValue(undefined);
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', type: 'user' }, SECRET);
      const ctx = buildContext({ headers: { authorization: `Bearer ${token}` } });

      expect(() => guard.canActivate(ctx)).toThrow(TokenInvalidException);
    });
  });
});
