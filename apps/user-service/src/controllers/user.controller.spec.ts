import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from '../services/user.service';
import { Language } from '@cyna-api/common';

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            getById: jest.fn(),
            markVerified: jest.fn(),
            updatePasswordHash: jest.fn(),
            updateStripeCustomerId: jest.fn(),
            getProfile: jest.fn(),
            updateProfile: jest.fn(),
            updatePassword: jest.fn(),
            updateLanguage: jest.fn(),
            deleteAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UserController);
    service = module.get(UserService);
  });

  it('create → delegates to service.create', async () => {
    service.create.mockResolvedValue({ id: 'u1' } as never);
    await controller.create({ email: 'a@b.c', passwordHash: 'h', firstName: 'A', lastName: 'B' });
    expect(service.create).toHaveBeenCalled();
  });

  it('findByEmail → returns whatever service returns', async () => {
    service.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.c', passwordHash: 'h' } as never);
    const res = await controller.findByEmail({ email: 'a@b.c' });
    expect(res?.id).toBe('u1');
  });

  it('getById → delegates', async () => {
    service.getById.mockResolvedValue({ id: 'u1' } as never);
    await controller.getById({ userId: 'u1' });
    expect(service.getById).toHaveBeenCalledWith('u1');
  });

  it('markVerified → fire-and-forget', async () => {
    await controller.markVerified({ userId: 'u1' });
    expect(service.markVerified).toHaveBeenCalledWith('u1');
  });

  it('updatePasswordHash → delegates', async () => {
    await controller.updatePasswordHash({ userId: 'u1', passwordHash: 'h' });
    expect(service.updatePasswordHash).toHaveBeenCalledWith('u1', 'h');
  });

  it('updateStripeCustomerId → delegates', async () => {
    await controller.updateStripeCustomerId({ userId: 'u1', stripeCustomerId: 'cus_1' });
    expect(service.updateStripeCustomerId).toHaveBeenCalledWith('u1', 'cus_1');
  });

  it('getProfile → delegates', async () => {
    await controller.getProfile({ userId: 'u1' });
    expect(service.getProfile).toHaveBeenCalledWith('u1');
  });

  it('updateProfile → strips userId and forwards dto', async () => {
    await controller.updateProfile({ userId: 'u1', firstName: 'N' });
    expect(service.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'N' });
  });

  it('updatePassword → strips userId and forwards dto', async () => {
    await controller.updatePassword({ userId: 'u1', currentPassword: 'c', newPassword: 'n' });
    expect(service.updatePassword).toHaveBeenCalledWith('u1', {
      currentPassword: 'c',
      newPassword: 'n',
    });
  });

  it('updateLanguage → delegates', async () => {
    await controller.updateLanguage({ userId: 'u1', preferredLanguage: Language.EN });
    expect(service.updateLanguage).toHaveBeenCalledWith('u1', { preferredLanguage: Language.EN });
  });

  it('deleteAccount → delegates', async () => {
    await controller.deleteAccount({ userId: 'u1', password: 'p' });
    expect(service.deleteAccount).toHaveBeenCalledWith('u1', { password: 'p' });
  });
});
