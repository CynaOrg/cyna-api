import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  UpdateProfileDto,
  UpdatePasswordDto,
  DeleteAccountDto,
  Language,
} from '@cyna-api/common';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @MessagePattern(MESSAGE_PATTERNS.USER.CREATE)
  async create(@Payload() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.FIND_BY_EMAIL)
  async findByEmail(@Payload() data: { email: string }) {
    return this.userService.findByEmail(data.email);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_BY_ID)
  async getById(@Payload() data: { userId: string }) {
    return this.userService.getById(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.MARK_VERIFIED)
  async markVerified(@Payload() data: { userId: string }) {
    await this.userService.markVerified(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD_HASH)
  async updatePasswordHash(@Payload() data: { userId: string; passwordHash: string }) {
    await this.userService.updatePasswordHash(data.userId, data.passwordHash);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_STRIPE_CUSTOMER_ID)
  async updateStripeCustomerId(@Payload() data: { userId: string; stripeCustomerId: string }) {
    await this.userService.updateStripeCustomerId(data.userId, data.stripeCustomerId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_PROFILE)
  async getProfile(@Payload() data: { userId: string }) {
    return this.userService.getProfile(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PROFILE)
  async updateProfile(@Payload() data: { userId: string } & UpdateProfileDto) {
    const { userId, ...dto } = data;
    return this.userService.updateProfile(userId, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD)
  async updatePassword(@Payload() data: { userId: string } & UpdatePasswordDto) {
    const { userId, ...dto } = data;
    return this.userService.updatePassword(userId, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE)
  async updateLanguage(@Payload() data: { userId: string; preferredLanguage: Language }) {
    const { userId, preferredLanguage } = data;
    return this.userService.updateLanguage(userId, { preferredLanguage });
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT)
  async deleteAccount(@Payload() data: { userId: string } & DeleteAccountDto) {
    const { userId, ...dto } = data;
    return this.userService.deleteAccount(userId, dto);
  }
}
