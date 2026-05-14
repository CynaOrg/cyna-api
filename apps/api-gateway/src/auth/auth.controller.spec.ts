import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';

type Res = { cookie: jest.Mock; clearCookie: jest.Mock };

const buildRes = (): Res => ({ cookie: jest.fn(), clearCookie: jest.fn() });

describe('Gateway AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerification: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AuthController);
  });

  it('register delegates to service', async () => {
    authService.register.mockResolvedValue({ id: 'u1' } as never);
    const r = await controller.register({ email: 'a@b.c' } as never);
    expect(r).toEqual({ id: 'u1' });
    expect(authService.register).toHaveBeenCalled();
  });

  describe('login', () => {
    it('strips refreshToken from body for web client and sets cookie', async () => {
      authService.login.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      } as never);
      const res = buildRes();
      const req = { headers: {} } as never;
      const result = (await controller.login({ email: 'a' } as never, req, res as never)) as Record<
        string,
        unknown
      >;
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt', expect.any(Object));
      expect(result.refreshToken).toBeUndefined();
      expect(result.accessToken).toBe('at');
    });

    it('keeps refreshToken for mobile client', async () => {
      authService.login.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      } as never);
      const res = buildRes();
      const req = { headers: { 'x-client-type': 'mobile' } } as never;
      const result = (await controller.login({ email: 'a' } as never, req, res as never)) as Record<
        string,
        unknown
      >;
      expect(res.cookie).toHaveBeenCalled();
      expect(result.refreshToken).toBe('rt');
    });

    it('returns result as-is when no refreshToken', async () => {
      authService.login.mockResolvedValue({ accessToken: 'at' } as never);
      const res = buildRes();
      const req = { headers: {} } as never;
      const result = await controller.login({} as never, req, res as never);
      expect(res.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'at' });
    });
  });

  it('verifyEmail delegates to service', async () => {
    authService.verifyEmail.mockResolvedValue({ ok: true } as never);
    await controller.verifyEmail({ token: 't' } as never);
    expect(authService.verifyEmail).toHaveBeenCalled();
  });

  it('resendVerification delegates to service', async () => {
    authService.resendVerification.mockResolvedValue({} as never);
    await controller.resendVerification({ email: 'x' } as never);
    expect(authService.resendVerification).toHaveBeenCalled();
  });

  it('forgotPassword delegates to service', async () => {
    authService.forgotPassword.mockResolvedValue({} as never);
    await controller.forgotPassword({ email: 'x' } as never);
    expect(authService.forgotPassword).toHaveBeenCalled();
  });

  it('resetPassword delegates to service', async () => {
    authService.resetPassword.mockResolvedValue({} as never);
    await controller.resetPassword({ token: 't', password: 'p' } as never);
    expect(authService.resetPassword).toHaveBeenCalled();
  });

  describe('refreshToken', () => {
    it('throws Unauthorized when no token provided', async () => {
      const req = { cookies: {}, headers: {} } as never;
      const res = buildRes();
      await expect(controller.refreshToken(req, res as never, {} as never)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('uses cookie token, sets new cookie, strips for web', async () => {
      authService.refreshToken.mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
      } as never);
      const res = buildRes();
      const req = { cookies: { refresh_token: 'rtc' }, headers: {} } as never;
      const r = (await controller.refreshToken(req, res as never, {} as never)) as Record<
        string,
        unknown
      >;
      expect(authService.refreshToken).toHaveBeenCalledWith({ refreshToken: 'rtc' });
      expect(res.cookie).toHaveBeenCalled();
      expect(r.refreshToken).toBeUndefined();
    });

    it('uses body token when cookie missing and keeps for mobile', async () => {
      authService.refreshToken.mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
      } as never);
      const res = buildRes();
      const req = { cookies: {}, headers: { 'x-client-type': 'mobile' } } as never;
      const r = (await controller.refreshToken(
        req,
        res as never,
        {
          refreshToken: 'body-rt',
        } as never,
      )) as Record<string, unknown>;
      expect(authService.refreshToken).toHaveBeenCalledWith({ refreshToken: 'body-rt' });
      expect(r.refreshToken).toBe('rt2');
    });
  });

  describe('logout', () => {
    it('uses cookie token, clears cookie, returns message', async () => {
      authService.logout.mockResolvedValue({} as never);
      const res = buildRes();
      const req = { cookies: { refresh_token: 'rtc' } } as never;
      const r = await controller.logout('u1', req, res as never, {} as never);
      expect(authService.logout).toHaveBeenCalledWith('u1', { refreshToken: 'rtc' });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
      expect(r).toEqual({ message: 'common.messages.loggedOut' });
    });

    it('falls back to body token', async () => {
      authService.logout.mockResolvedValue({} as never);
      const res = buildRes();
      const req = { cookies: {} } as never;
      await controller.logout('u1', req, res as never, { refreshToken: 'br' } as never);
      expect(authService.logout).toHaveBeenCalledWith('u1', { refreshToken: 'br' });
    });
  });
});
