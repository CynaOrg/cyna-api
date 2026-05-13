import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import {
  CynaLoggerService,
  Language,
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdateLanguageDto,
  DeleteAccountDto,
  SERVICE_NAMES,
  EVENT_PATTERNS,
  UserCredentialsView,
  UserProfileView,
} from '@cyna-api/common';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';

const BCRYPT_COST = 12;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.AUTH)
    private readonly authClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserProfileView> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'errors.user.emailExists',
        code: 'EMAIL_EXISTS',
      });
    }

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: dto.passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      vatNumber: dto.vatNumber,
      preferredLanguage: dto.preferredLanguage ?? Language.FR,
      isVerified: false,
      isActive: true,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`User created: ${saved.id}`, 'UserService');
    return this.toProfileView(saved);
  }

  async findByEmail(email: string): Promise<UserProfileView | null> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) return null;
    return this.toProfileView(user);
  }

  async findByEmailForLogin(email: string): Promise<UserCredentialsView | null> {
    // passwordHash is select:false; opt in explicitly here, this is the only
    // entry point that needs the bcrypt hash for password verification.
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      isVerified: user.isVerified,
      preferredLanguage: user.preferredLanguage,
    };
  }

  async getById(userId: string): Promise<UserProfileView> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.user.notFound',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.toProfileView(user);
  }

  async markVerified(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { isVerified: true });
    this.logger.log(`User marked verified: ${userId}`, 'UserService');
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { passwordHash });
    this.logger.log(`Password hash updated for user: ${userId}`, 'UserService');
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { stripeCustomerId });
  }

  async getProfile(userId: string): Promise<UserProfileView> {
    const user = await this.findActiveUserOrThrow(userId);
    return this.toProfileView(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<{ message: string; user: UserProfileView }> {
    const user = await this.findActiveUserOrThrow(userId);
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.companyName !== undefined) user.companyName = dto.companyName;
    if (dto.vatNumber !== undefined) user.vatNumber = dto.vatNumber;
    const saved = await this.userRepository.save(user);
    this.logger.log(`Profile updated for user: ${saved.id}`, 'UserService');
    return { message: 'common.messages.profileUpdated', user: this.toProfileView(saved) };
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto): Promise<{ message: string }> {
    const user = await this.findActiveUserOrThrow(userId, { withPasswordHash: true });
    const valid = await this.comparePassword(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.user.invalidPassword',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.user.newPasswordSameAsCurrent',
        code: 'SAME_PASSWORD',
      });
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    await this.userRepository.save(user);

    this.authClient.emit(EVENT_PATTERNS.USER.PASSWORD_CHANGED, {
      userId: user.id,
      email: user.email,
      language: user.preferredLanguage,
    });

    this.logger.log(`Password updated for user: ${user.id}`, 'UserService');
    return { message: 'common.messages.passwordUpdated' };
  }

  async updateLanguage(
    userId: string,
    dto: UpdateLanguageDto,
  ): Promise<{ message: string; user: UserProfileView }> {
    const user = await this.findActiveUserOrThrow(userId);
    user.preferredLanguage = dto.preferredLanguage;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Language updated for user: ${saved.id} to ${dto.preferredLanguage}`,
      'UserService',
    );
    return { message: 'common.messages.languageUpdated', user: this.toProfileView(saved) };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{ message: string }> {
    const user = await this.findActiveUserOrThrow(userId, { withPasswordHash: true });
    const valid = await this.comparePassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.user.passwordIncorrect',
        code: 'INVALID_PASSWORD',
      });
    }
    user.isActive = false;
    await this.userRepository.save(user);

    this.authClient.emit(EVENT_PATTERNS.USER.DELETED, {
      userId: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
    });

    this.logger.log(`Account soft-deleted for user: ${user.id}`, 'UserService');
    return { message: 'common.messages.accountDeleted' };
  }

  private async findActiveUserOrThrow(
    userId: string,
    options: { withPasswordHash?: boolean } = {},
  ): Promise<User> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId });
    if (options.withPasswordHash) {
      qb.addSelect('user.passwordHash');
    }
    const user = await qb.getOne();
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.user.notFound',
        code: 'USER_NOT_FOUND',
      });
    }
    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.accountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }
    return user;
  }

  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  private toProfileView(user: User): UserProfileView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      vatNumber: user.vatNumber,
      isActive: user.isActive,
      isVerified: user.isVerified,
      preferredLanguage: user.preferredLanguage,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
