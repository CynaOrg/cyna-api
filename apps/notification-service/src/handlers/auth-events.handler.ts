import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  EVENT_PATTERNS,
  Language,
  CynaLoggerService,
  UserVerifiedEvent,
  PasswordChangedEvent,
  PasswordResetCompletedEvent,
} from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';
import { UserRegisteredEvent } from './interfaces/user-registered.event';
import { PasswordResetRequestedEvent } from './interfaces/password-reset-requested.event';
import { Admin2FACodeRequestedEvent } from './interfaces/admin-2fa-code-requested.event';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AuthEventsHandler {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {}

  private baseVars(): { frontendUrl: string; year: number } {
    return {
      frontendUrl: this.configService.get<string>('FRONTEND_URL', 'http://localhost:4200'),
      year: new Date().getFullYear(),
    };
  }

  @EventPattern(EVENT_PATTERNS.AUTH.USER_REGISTERED)
  async handleUserRegistered(@Payload() data: UserRegisteredEvent): Promise<void> {
    this.logger.log(
      `Processing user_registered event for user: ${data.userId}`,
      'AuthEventsHandler',
    );
    try {
      await this.processUserRegistered(data);
    } catch (error) {
      this.logger.error(
        `Failed to process user_registered event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processUserRegistered(data: UserRegisteredEvent): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:4200');
    const verificationLink = `${frontendUrl}/auth/verify-email?token=${data.verificationToken}`;

    const subjects: Record<string, string> = {
      fr: 'Vérifiez votre adresse email - CYNA',
      en: 'Verify your email address - CYNA',
    };

    const html = this.emailTemplateService.render('email-verification', data.language, {
      firstName: data.firstName,
      lastName: data.lastName,
      verificationLink,
      frontendUrl,
    });

    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] || subjects.fr,
      html,
    });

    this.logger.log(
      `Verification email sent successfully for user: ${data.userId}`,
      'AuthEventsHandler',
    );
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_RESET_REQUESTED)
  async handlePasswordResetRequested(@Payload() data: PasswordResetRequestedEvent): Promise<void> {
    this.logger.log(
      `Processing password_reset_requested event for user: ${data.userId}`,
      'AuthEventsHandler',
    );
    try {
      await this.processPasswordResetRequested(data);
    } catch (error) {
      this.logger.error(
        `Failed to process password_reset_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processPasswordResetRequested(data: PasswordResetRequestedEvent): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:4200');
    const resetLink = `${frontendUrl}/auth/reset-password?token=${data.resetToken}`;

    const subjects: Record<string, string> = {
      fr: 'Réinitialisez votre mot de passe - CYNA',
      en: 'Reset your password - CYNA',
    };

    const html = this.emailTemplateService.render('password-reset', data.language, {
      firstName: data.firstName,
      resetLink,
      frontendUrl,
    });

    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] || subjects.fr,
      html,
    });

    this.logger.log(
      `Password reset email sent successfully for user: ${data.userId}`,
      'AuthEventsHandler',
    );
  }

  @EventPattern(EVENT_PATTERNS.AUTH.ADMIN_2FA_CODE_REQUESTED)
  async handleAdmin2FACodeRequested(@Payload() data: Admin2FACodeRequestedEvent): Promise<void> {
    this.logger.log(
      `Processing admin_2fa_code_requested event for admin: ${data.adminId}`,
      'AuthEventsHandler',
    );
    try {
      await this.processAdmin2FACodeRequested(data);
    } catch (error) {
      this.logger.error(
        `Failed to process admin_2fa_code_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processAdmin2FACodeRequested(data: Admin2FACodeRequestedEvent): Promise<void> {
    const backofficeUrl = this.configService.get<string>('BACKOFFICE_URL', 'http://localhost:4201');

    const subjects: Record<string, string> = {
      fr: 'Votre code de vérification - CYNA Admin',
      en: 'Your verification code - CYNA Admin',
    };

    const html = this.emailTemplateService.render('admin-2fa-code', data.language, {
      ...this.baseVars(),
      firstName: data.firstName,
      code: data.code,
      expiresInMinutes: data.expiresInMinutes,
      backofficeUrl,
    });

    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] || subjects.fr,
      html,
    });

    this.logger.log(
      `2FA code email sent successfully for admin: ${data.adminId}`,
      'AuthEventsHandler',
    );
  }

  @EventPattern(EVENT_PATTERNS.AUTH.USER_VERIFIED)
  async handleUserVerified(@Payload() data: UserVerifiedEvent): Promise<void> {
    this.logger.log(
      `Handling AUTH.USER_VERIFIED for user ${data.userId} (lang=${data.language})`,
      'AuthEventsHandler',
    );
    try {
      await this.processUserVerified(data);
    } catch (error) {
      this.logger.error(
        `Failed to handle USER_VERIFIED event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processUserVerified(data: UserVerifiedEvent): Promise<void> {
    const subjects: Record<Language, string> = {
      [Language.FR]: 'Bienvenue chez CYNA',
      [Language.EN]: 'Welcome to CYNA',
    };
    const html = this.emailTemplateService.render('welcome', data.language, this.baseVars());
    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] ?? subjects[Language.FR],
      html,
    });
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_CHANGED)
  async handlePasswordChanged(@Payload() data: PasswordChangedEvent): Promise<void> {
    this.logger.log(
      `Handling AUTH.PASSWORD_CHANGED for user ${data.userId} (lang=${data.language})`,
      'AuthEventsHandler',
    );
    try {
      await this.processPasswordChanged(data);
    } catch (error) {
      this.logger.error(
        `Failed to handle PASSWORD_CHANGED event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processPasswordChanged(data: PasswordChangedEvent): Promise<void> {
    const subjects: Record<Language, string> = {
      [Language.FR]: 'Votre mot de passe a ete modifie',
      [Language.EN]: 'Your password has been changed',
    };
    const html = this.emailTemplateService.render(
      'password-changed',
      data.language,
      this.baseVars(),
    );
    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] ?? subjects[Language.FR],
      html,
    });
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_RESET_COMPLETED)
  async handlePasswordResetCompleted(@Payload() data: PasswordResetCompletedEvent): Promise<void> {
    this.logger.log(
      `Handling AUTH.PASSWORD_RESET_COMPLETED for user ${data.userId} (lang=${data.language})`,
      'AuthEventsHandler',
    );
    try {
      await this.processPasswordResetCompleted(data);
    } catch (error) {
      this.logger.error(
        `Failed to handle PASSWORD_RESET_COMPLETED event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  private async processPasswordResetCompleted(data: PasswordResetCompletedEvent): Promise<void> {
    const subjects: Record<Language, string> = {
      [Language.FR]: 'Mot de passe reinitialise',
      [Language.EN]: 'Password reset successful',
    };
    const html = this.emailTemplateService.render(
      'password-reset-success',
      data.language,
      this.baseVars(),
    );
    await this.emailService.sendEmail({
      to: data.email,
      subject: subjects[data.language] ?? subjects[Language.FR],
      html,
    });
  }
}
