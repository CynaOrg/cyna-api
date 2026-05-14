import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { AuthService } from './auth.service';

describe('Gateway AuthService', () => {
  let service: AuthService;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn().mockReturnValue(of({ ok: true })) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: SERVICE_NAMES.AUTH, useValue: client }],
    }).compile();
    service = module.get(AuthService);
  });

  it.each<[string, keyof AuthService, unknown, { cmd: string }]>([
    ['register', 'register', { email: 'a' }, MESSAGE_PATTERNS.AUTH.REGISTER_USER],
    ['login', 'login', { email: 'a' }, MESSAGE_PATTERNS.AUTH.VALIDATE_USER],
    ['verifyEmail', 'verifyEmail', { token: 't' }, MESSAGE_PATTERNS.AUTH.VERIFY_EMAIL],
    ['forgotPassword', 'forgotPassword', { email: 'a' }, MESSAGE_PATTERNS.AUTH.FORGOT_PASSWORD],
    ['resetPassword', 'resetPassword', { token: 't' }, MESSAGE_PATTERNS.AUTH.RESET_PASSWORD],
    ['refreshToken', 'refreshToken', { refreshToken: 'r' }, MESSAGE_PATTERNS.AUTH.REFRESH_TOKEN],
    ['adminLogin', 'adminLogin', { email: 'a' }, MESSAGE_PATTERNS.AUTH.ADMIN_LOGIN],
    ['adminVerify2FA', 'adminVerify2FA', { code: '1' }, MESSAGE_PATTERNS.AUTH.ADMIN_VERIFY_2FA],
    ['adminResend2FA', 'adminResend2FA', { email: 'a' }, MESSAGE_PATTERNS.AUTH.ADMIN_RESEND_2FA],
    [
      'adminRefreshToken',
      'adminRefreshToken',
      { refreshToken: 'r' },
      MESSAGE_PATTERNS.AUTH.ADMIN_REFRESH_TOKEN,
    ],
  ])('%s sends correct pattern', async (_label, method, payload, pattern) => {
    await (service[method] as (p: unknown) => Promise<unknown>)(payload);
    expect(client.send).toHaveBeenCalledWith(pattern, payload);
  });

  it('resendVerification forwards email-only payload', async () => {
    await service.resendVerification({ email: 'a' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.AUTH.RESEND_VERIFICATION, {
      email: 'a',
    });
  });

  it('logout forwards userId and refreshToken', async () => {
    await service.logout('u1', { refreshToken: 'r' });
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.AUTH.LOGOUT, {
      userId: 'u1',
      refreshToken: 'r',
    });
  });

  it('adminLogout forwards adminId and refreshToken', async () => {
    await service.adminLogout('a1', { refreshToken: 'r' });
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.AUTH.ADMIN_LOGOUT, {
      adminId: 'a1',
      refreshToken: 'r',
    });
  });

  describe('error handling', () => {
    it('maps RpcException-like error to HttpException', async () => {
      client.send.mockReturnValue(
        throwError(() => ({ statusCode: 400, message: 'bad', code: 'BAD' })),
      );
      await expect(service.login({} as never)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('maps RpcException-like without status to 500', async () => {
      client.send.mockReturnValue(throwError(() => ({ statusCode: 0 })));
      await expect(service.login({} as never)).rejects.toBeInstanceOf(HttpException);
    });

    it('maps TimeoutError name to 503', async () => {
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      client.send.mockReturnValue(throwError(() => err));
      await expect(service.login({} as never)).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('rethrows unknown errors', async () => {
      client.send.mockReturnValue(throwError(() => new Error('boom')));
      await expect(service.login({} as never)).rejects.toThrow('boom');
    });
  });
});
