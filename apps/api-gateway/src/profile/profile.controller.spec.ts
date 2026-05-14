import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards';

describe('ProfileController', () => {
  let controller: ProfileController;
  let userClient: { send: jest.Mock };

  beforeEach(async () => {
    userClient = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [ProfileService, { provide: SERVICE_NAMES.USER, useValue: userClient }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ProfileController);
  });

  it('GET / forwards user.get_profile', async () => {
    userClient.send.mockReturnValue(of({ id: 'u1', email: 'a@b.c' }));
    const res = await controller.getProfile('u1');
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.GET_PROFILE, {
      userId: 'u1',
    });
    expect(res).toEqual({ id: 'u1', email: 'a@b.c' });
  });

  it('PATCH / forwards update_profile with userId and dto fields', async () => {
    await controller.updateProfile('u1', { firstName: 'Tom' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_PROFILE, {
      userId: 'u1',
      firstName: 'Tom',
    });
  });

  it('POST /password forwards update_password', async () => {
    await controller.updatePassword('u1', {
      currentPassword: 'Old1!',
      newPassword: 'New1!',
    } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD, {
      userId: 'u1',
      currentPassword: 'Old1!',
      newPassword: 'New1!',
    });
  });

  it('PATCH /language forwards update_language', async () => {
    await controller.updateLanguage('u1', { language: Language.FR } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE, {
      userId: 'u1',
      language: Language.FR,
    });
  });

  it('POST /delete forwards delete_account', async () => {
    await controller.deleteAccount('u1', { password: 'Pw' } as never);
    expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT, {
      userId: 'u1',
      password: 'Pw',
    });
  });
});
