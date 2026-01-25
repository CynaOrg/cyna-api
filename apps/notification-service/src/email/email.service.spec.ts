import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { CynaLoggerService } from '@cyna-api/common';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  let mockTransporter: {
    verify: jest.Mock;
    sendMail: jest.Mock;
  };
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
  };

  beforeEach(async () => {
    mockTransporter = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string | number | boolean) => {
              const config: Record<string, string | number | boolean> = {
                SMTP_HOST: 'smtp.test.com',
                SMTP_PORT: 587,
                SMTP_SECURE: false,
                SMTP_USER: 'test@test.com',
                SMTP_PASSWORD: 'password',
                SMTP_FROM_NAME: 'CYNA Test',
                SMTP_FROM_EMAIL: 'noreply@test.com',
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

    service = module.get<EmailService>(EmailService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create transporter and verify connection', async () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'password',
        },
      });
      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'SMTP connection verified successfully',
        'EmailService',
      );
    });

    it('should log error when SMTP verification fails', async () => {
      mockTransporter.verify.mockRejectedValueOnce(new Error('Connection failed'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string | number | boolean) => defaultValue),
            },
          },
          {
            provide: CynaLoggerService,
            useValue: mockLogger,
          },
        ],
      }).compile();

      const newService = module.get<EmailService>(EmailService);
      await newService.onModuleInit();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const emailDto = {
        to: 'recipient@test.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content',
      };

      const result = await service.sendEmail(emailDto);

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"CYNA Test" <noreply@test.com>',
        to: 'recipient@test.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content',
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Email sent successfully'),
        'EmailService',
      );
    });

    it('should return false when email fails to send', async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));

      const emailDto = {
        to: 'recipient@test.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      };

      const result = await service.sendEmail(emailDto);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send email'),
        expect.any(String),
        'EmailService',
      );
    });
  });
});
