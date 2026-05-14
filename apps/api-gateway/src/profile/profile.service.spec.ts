import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { ProfileService } from './profile.service';

describe('Gateway ProfileService', () => {
  let service: ProfileService;
  let userClient: { send: jest.Mock };

  beforeEach(async () => {
    userClient = { send: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfileService, { provide: SERVICE_NAMES.USER, useValue: userClient }],
    }).compile();
    service = module.get(ProfileService);
  });

  it('getProfile forwards', async () => {
    userClient.send.mockReturnValue(of({ id: 'u1' }));
    await service.getProfile('u1');
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.GET_PROFILE, {
      userId: 'u1',
    });
  });

  it('updateProfile forwards', async () => {
    userClient.send.mockReturnValue(of({}));
    await service.updateProfile('u1', { firstName: 'T' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_PROFILE, {
      userId: 'u1',
      firstName: 'T',
    });
  });

  it('updatePassword forwards', async () => {
    userClient.send.mockReturnValue(of({}));
    await service.updatePassword('u1', { currentPassword: 'a', newPassword: 'b' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD, {
      userId: 'u1',
      currentPassword: 'a',
      newPassword: 'b',
    });
  });

  it('updateLanguage forwards', async () => {
    userClient.send.mockReturnValue(of({}));
    await service.updateLanguage('u1', { language: 'fr' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE, {
      userId: 'u1',
      language: 'fr',
    });
  });

  it('deleteAccount forwards', async () => {
    userClient.send.mockReturnValue(of({}));
    await service.deleteAccount('u1', { password: 'p' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT, {
      userId: 'u1',
      password: 'p',
    });
  });

  describe('errors', () => {
    it('maps RPC statusCode error to HttpException', async () => {
      userClient.send.mockReturnValue(
        throwError(() => ({ statusCode: 404, message: 'Not found' })),
      );
      try {
        await service.getProfile('u1');
        fail('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(404);
      }
    });

    it('maps TimeoutError to 503', async () => {
      const e = new Error('Timeout');
      e.name = 'TimeoutError';
      userClient.send.mockReturnValue(throwError(() => e));
      await expect(service.getProfile('u1')).rejects.toBeInstanceOf(HttpException);
    });

    it('re-throws unknown error as-is', async () => {
      const e = new Error('Weird');
      userClient.send.mockReturnValue(throwError(() => e));
      await expect(service.getProfile('u1')).rejects.toBe(e);
    });
  });
});
