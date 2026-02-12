import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS, CynaLoggerService } from '@cyna-api/common';
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

  @EventPattern(EVENT_PATTERNS.AUTH.USER_REGISTERED)
  async handleUserRegistered(@Payload() data: UserRegisteredEvent): Promise<void> {
    this.logger.log(
      `Processing user_registered event for user: ${data.email}`,
      'AuthEventsHandler',
    );

    try {
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

      this.logger.log(`Verification email sent successfully to ${data.email}`, 'AuthEventsHandler');
    } catch (error) {
      this.logger.error(
        `Failed to process user_registered event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_RESET_REQUESTED)
  async handlePasswordResetRequested(@Payload() data: PasswordResetRequestedEvent): Promise<void> {
    this.logger.log(
      `Processing password_reset_requested event for user: ${data.email}`,
      'AuthEventsHandler',
    );

    try {
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
        `Password reset email sent successfully to ${data.email}`,
        'AuthEventsHandler',
      );
    } catch (error) {
      this.logger.error(
        `Failed to process password_reset_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.AUTH.ADMIN_2FA_CODE_REQUESTED)
  async handleAdmin2FACodeRequested(@Payload() data: Admin2FACodeRequestedEvent): Promise<void> {
    this.logger.log(
      `Processing admin_2fa_code_requested event for admin: ${data.email}`,
      'AuthEventsHandler',
    );

    try {
      const backofficeUrl = this.configService.get<string>(
        'BACKOFFICE_URL',
        'http://localhost:4201',
      );

      const subjects: Record<string, string> = {
        fr: 'Votre code de vérification - CYNA Admin',
        en: 'Your verification code - CYNA Admin',
      };

      const html = this.emailTemplateService.render('admin-2fa-code', data.language, {
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

      this.logger.log(`2FA code email sent successfully to ${data.email}`, 'AuthEventsHandler');
    } catch (error) {
      this.logger.error(
        `Failed to process admin_2fa_code_requested event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'AuthEventsHandler',
      );
    }
  }
}
