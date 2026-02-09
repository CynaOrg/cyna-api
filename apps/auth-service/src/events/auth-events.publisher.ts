import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES, EVENT_PATTERNS, CynaLoggerService } from '@cyna-api/common';
import { Language } from '@cyna-api/common';

export interface UserRegisteredEventData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  verificationToken: string;
  language: Language;
}

export interface PasswordResetRequestedEventData {
  userId: string;
  email: string;
  firstName: string;
  resetToken: string;
  language: Language;
}

export interface Admin2FACodeRequestedEventData {
  adminId: string;
  email: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
  language: Language;
}

@Injectable()
export class AuthEventsPublisher {
  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async emitUserRegistered(data: UserRegisteredEventData): Promise<void> {
    try {
      await firstValueFrom(this.notificationClient.emit(EVENT_PATTERNS.AUTH.USER_REGISTERED, data));
      this.logger.log(
        `Emitted user_registered event for user: ${data.email}`,
        'AuthEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit user_registered event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitPasswordResetRequested(data: PasswordResetRequestedEventData): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.PASSWORD_RESET_REQUESTED, data),
      );
      this.logger.log(
        `Emitted password_reset_requested event for user: ${data.email}`,
        'AuthEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit password_reset_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitAdmin2FACodeRequested(data: Admin2FACodeRequestedEventData): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.ADMIN_2FA_CODE_REQUESTED, data),
      );
      this.logger.log(
        `Emitted admin_2fa_code_requested event for admin: ${data.email}`,
        'AuthEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit admin_2fa_code_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitUserVerified(userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.USER_VERIFIED, { userId }),
      );
      this.logger.log(`Emitted user_verified event for user: ${userId}`, 'AuthEventsPublisher');
    } catch (error) {
      this.logger.error(
        `Failed to emit user_verified event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitUserLogin(userId: string, userAgent?: string, ip?: string): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.USER_LOGIN, {
          userId,
          userAgent,
          ip,
          timestamp: new Date(),
        }),
      );
      this.logger.log(`Emitted user_login event for user: ${userId}`, 'AuthEventsPublisher');
    } catch (error) {
      this.logger.error(
        `Failed to emit user_login event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitAdminLogin(adminId: string, userAgent?: string, ip?: string): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.ADMIN_LOGIN, {
          adminId,
          userAgent,
          ip,
          timestamp: new Date(),
        }),
      );
      this.logger.log(`Emitted admin_login event for admin: ${adminId}`, 'AuthEventsPublisher');
    } catch (error) {
      this.logger.error(
        `Failed to emit admin_login event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }

  async emitPasswordResetCompleted(userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.PASSWORD_RESET_COMPLETED, {
          userId,
          timestamp: new Date(),
        }),
      );
      this.logger.log(
        `Emitted password_reset_completed event for user: ${userId}`,
        'AuthEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit password_reset_completed event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsPublisher',
      );
    }
  }
}
