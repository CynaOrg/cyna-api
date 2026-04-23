import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthEventsHandler } from './auth-events.handler';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';
import { CynaLoggerService, Language } from '@cyna-api/common';

describe('AuthEventsHandler', () => {
  let handler: AuthEventsHandler;
  let mockEmailService: {
    sendEmail: jest.Mock;
  };
  let mockEmailTemplateService: {
    render: jest.Mock;
  };
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(async () => {
    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    mockEmailTemplateService = {
      render: jest.fn().mockReturnValue('<html>Rendered template</html>'),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthEventsHandler,
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: EmailTemplateService,
          useValue: mockEmailTemplateService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => {
              const config: Record<string, string> = {
                FRONTEND_URL: 'http://localhost:4200',
                BACKOFFICE_URL: 'http://localhost:4201',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    handler = module.get<AuthEventsHandler>(AuthEventsHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleUserRegistered', () => {
    const userRegisteredEvent = {
      userId: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      verificationToken: 'verification-token-123',
      language: Language.FR,
    };

    it('should send verification email', async () => {
      await handler.handleUserRegistered(userRegisteredEvent);

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith('email-verification', 'fr', {
        firstName: 'John',
        lastName: 'Doe',
        verificationLink: 'http://localhost:4200/auth/verify-email?token=verification-token-123',
        frontendUrl: 'http://localhost:4200',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Vérifiez votre adresse email - CYNA',
        html: '<html>Rendered template</html>',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Verification email sent successfully to test@example.com',
        'AuthEventsHandler',
      );
    });

    it('should use English subject for English language', async () => {
      const englishEvent = { ...userRegisteredEvent, language: Language.EN };

      await handler.handleUserRegistered(englishEvent);

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Verify your email address - CYNA',
        }),
      );
    });

    it('should log error on failure', async () => {
      mockEmailService.sendEmail.mockRejectedValueOnce(new Error('SMTP error'));

      await handler.handleUserRegistered(userRegisteredEvent);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handlePasswordResetRequested', () => {
    const passwordResetEvent = {
      userId: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      resetToken: 'reset-token-123',
      language: Language.FR,
    };

    it('should send password reset email', async () => {
      await handler.handlePasswordResetRequested(passwordResetEvent);

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith('password-reset', 'fr', {
        firstName: 'John',
        resetLink: 'http://localhost:4200/auth/reset-password?token=reset-token-123',
        frontendUrl: 'http://localhost:4200',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Réinitialisez votre mot de passe - CYNA',
        html: '<html>Rendered template</html>',
      });
    });
  });

  describe('handleAdmin2FACodeRequested', () => {
    const admin2FAEvent = {
      adminId: 'admin-123',
      email: 'admin@example.com',
      firstName: 'Admin',
      code: '123456',
      expiresInMinutes: 5,
      language: Language.FR,
    };

    it('should send 2FA code email', async () => {
      await handler.handleAdmin2FACodeRequested(admin2FAEvent);

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith('admin-2fa-code', 'fr', {
        firstName: 'Admin',
        code: '123456',
        expiresInMinutes: 5,
        backofficeUrl: 'http://localhost:4201',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: 'admin@example.com',
        subject: 'Votre code de vérification - CYNA Admin',
        html: '<html>Rendered template</html>',
      });
    });

    it('should use English subject for English language', async () => {
      const englishEvent = { ...admin2FAEvent, language: Language.EN };

      await handler.handleAdmin2FACodeRequested(englishEvent);

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your verification code - CYNA Admin',
        }),
      );
    });
  });

  describe('handleUserVerified', () => {
    it('renders welcome template in the payload language', async () => {
      await handler.handleUserVerified({
        userId: 'user-123',
        email: 'user@example.com',
        language: Language.EN,
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'welcome',
        Language.EN,
        expect.objectContaining({ frontendUrl: 'http://localhost:4200' }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com', subject: 'Welcome to CYNA' }),
      );
    });

    it('falls back to French subject when language is not fr/en', async () => {
      await handler.handleUserVerified({
        userId: 'user-123',
        email: 'user@example.com',
        language: 'de' as unknown as Language,
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Bienvenue chez CYNA' }),
      );
    });

    it('swallows EmailService failures without throwing', async () => {
      mockEmailService.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(
        handler.handleUserVerified({
          userId: 'user-123',
          email: 'user@example.com',
          language: Language.FR,
        }),
      ).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handlePasswordChanged', () => {
    it('renders password-changed template in the payload language', async () => {
      await handler.handlePasswordChanged({
        userId: 'user-123',
        email: 'user@example.com',
        language: Language.FR,
        timestamp: new Date(),
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'password-changed',
        Language.FR,
        expect.anything(),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Votre mot de passe a ete modifie',
        }),
      );
    });

    it('uses English subject for English payload', async () => {
      await handler.handlePasswordChanged({
        userId: 'user-123',
        email: 'user@example.com',
        language: Language.EN,
        timestamp: new Date(),
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Your password has been changed' }),
      );
    });
  });

  describe('handlePasswordResetCompleted', () => {
    it('renders password-reset-success template', async () => {
      await handler.handlePasswordResetCompleted({
        userId: 'user-123',
        email: 'user@example.com',
        language: Language.EN,
        timestamp: new Date(),
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'password-reset-success',
        Language.EN,
        expect.anything(),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Password reset successful',
        }),
      );
    });
  });
});
