import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { Language, CynaLoggerService } from '@cyna-api/common';

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let notificationClient: jest.Mocked<ClientProxy>;
  let authClient: jest.Mocked<ClientProxy>;
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as CynaLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: 'NOTIFICATION_SERVICE',
          useValue: { emit: jest.fn().mockReturnValue(of(undefined)) },
        },
        {
          provide: 'AUTH_SERVICE',
          useValue: { emit: jest.fn().mockReturnValue(of(undefined)) },
        },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get(getRepositoryToken(User));
    notificationClient = module.get('NOTIFICATION_SERVICE');
    authClient = module.get('AUTH_SERVICE');
  });

  describe('create', () => {
    it('creates a user when email is free', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue({ id: 'u1', email: 'a@b.c' } as User);
      userRepository.save.mockResolvedValue({ id: 'u1', email: 'a@b.c' } as User);

      const result = await service.create({
        email: 'a@b.c',
        passwordHash: '$2b$12$' + 'x'.repeat(53),
        firstName: 'A',
        lastName: 'B',
      });

      expect(userRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('u1');
    });

    it('throws 409 RpcException when email exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'existing' } as User);
      await expect(
        service.create({
          email: 'a@b.c',
          passwordHash: '$2b$12$' + 'x'.repeat(53),
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('findByEmail', () => {
    it('returns user with passwordHash when found', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        passwordHash: 'hash',
        isActive: true,
        isVerified: true,
      } as User;
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('a@b.c');

      expect(result).toMatchObject({ id: 'u1', email: 'a@b.c', passwordHash: 'hash' });
    });

    it('returns null when not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('nobody@x.x');
      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns user when found', async () => {
      const user = { id: 'u1' } as User;
      userRepository.findOne.mockResolvedValue(user);
      expect(await service.getById('u1')).toEqual(user);
    });

    it('throws 404 RpcException when not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.getById('nope')).rejects.toThrow(RpcException);
    });
  });

  describe('getProfile', () => {
    it('returns UserResponseDto shape for active verified user', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        isActive: true,
        isVerified: true,
        preferredLanguage: Language.FR,
      } as User;
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.getProfile('u1');

      expect(result).toMatchObject({ id: 'u1', email: 'a@b.c', firstName: 'A' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws 403 when isActive=false', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'u1', isActive: false } as User);
      await expect(service.getProfile('u1')).rejects.toThrow(RpcException);
    });
  });

  describe('markVerified', () => {
    it('sets isVerified=true', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.markVerified('u1');
      expect(userRepository.update).toHaveBeenCalledWith({ id: 'u1' }, { isVerified: true });
    });
  });

  describe('updatePasswordHash', () => {
    it('sets new passwordHash by userId', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.updatePasswordHash('u1', 'new_hash');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { passwordHash: 'new_hash' },
      );
    });
  });

  describe('updateStripeCustomerId', () => {
    it('sets stripeCustomerId by userId', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.updateStripeCustomerId('u1', 'cus_123');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { stripeCustomerId: 'cus_123' },
      );
    });
  });

  describe('updateProfile', () => {
    it('updates only provided fields', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        companyName: 'Old',
        isActive: true,
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, firstName: 'NewA' } as User);

      await service.updateProfile('u1', { firstName: 'NewA' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'NewA', lastName: 'B', companyName: 'Old' }),
      );
    });
  });

  describe('updatePassword', () => {
    it('rejects when current password is wrong', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'old_hash', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(false);

      await expect(
        service.updatePassword('u1', { currentPassword: 'wrong', newPassword: 'NewPw123!' }),
      ).rejects.toThrow(RpcException);
    });

    it('rejects when new password equals current password', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'old_hash', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(true);

      await expect(
        service.updatePassword('u1', { currentPassword: 'same', newPassword: 'same' }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('updateLanguage', () => {
    it('updates preferredLanguage', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        isActive: true,
        preferredLanguage: Language.FR,
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, preferredLanguage: Language.EN } as User);

      await service.updateLanguage('u1', { preferredLanguage: Language.EN });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ preferredLanguage: Language.EN }),
      );
    });
  });

  describe('deleteAccount', () => {
    it('rejects when password is wrong', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'h', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(false);

      await expect(service.deleteAccount('u1', { password: 'wrong' })).rejects.toThrow(
        RpcException,
      );
    });

    it('sets isActive=false and emits user.deleted event', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        passwordHash: 'h',
        isActive: true,
        stripeCustomerId: 'cus_1',
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, isActive: false } as User);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(true);

      await service.deleteAccount('u1', { password: 'correct' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(authClient.emit).toHaveBeenCalled();
    });
  });
});
