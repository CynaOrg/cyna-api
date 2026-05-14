// This spec uses jest.mock('fs'), which prevents @nestjs/config from reading
// the .env file at module-init time. JWT_SECRET is now validated as required
// (min 32 chars) by libs/common's env validation schema, so we must seed it
// on process.env before any import that transitively loads CynaConfigModule.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-key-minimum-32-characters!!';

import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplateService } from './email-template.service';
import { CynaLoggerService, Language } from '@cyna-api/common';
import * as fs from 'fs';

jest.mock('fs');

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
  };

  const mockBaseLayout = `
    <!DOCTYPE html>
    <html>
    <body>
      <div class="content">{{{content}}}</div>
      <p>Hello {{firstName}}</p>
    </body>
    </html>
  `;

  const mockFrTemplate =
    '<h1>Bienvenue {{firstName}}!</h1><a href="{{verificationLink}}">Verify</a>';
  const mockEnTemplate = '<h1>Welcome {{firstName}}!</h1><a href="{{verificationLink}}">Verify</a>';

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      // Match paths with forward or back slashes (Windows/Unix)
      if (filePath.includes('layouts') && filePath.includes('base.hbs')) return true;
      if (filePath.includes('templates') && (filePath.endsWith('fr') || filePath.endsWith('en')))
        return true;
      return false;
    });

    (fs.readdirSync as jest.Mock).mockImplementation((dirPath: string) => {
      if (dirPath.endsWith('fr') || dirPath.endsWith('en')) {
        return ['email-verification.hbs', 'password-reset.hbs'];
      }
      return [];
    });

    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath.includes('layouts') && filePath.includes('base.hbs')) return mockBaseLayout;
      if (filePath.includes('fr') && filePath.includes('.hbs')) return mockFrTemplate;
      if (filePath.includes('en') && filePath.includes('.hbs')) return mockEnTemplate;
      return '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplateService,
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should load base layout successfully', async () => {
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Base layout loaded successfully',
        'EmailTemplateService',
      );
    });

    it('should load language-specific templates', async () => {
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Template loaded: fr/email-verification',
        'EmailTemplateService',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Template loaded: en/email-verification',
        'EmailTemplateService',
      );
    });
  });

  describe('render', () => {
    it('should render French template with variables', () => {
      const result = service.render('email-verification', Language.FR, {
        firstName: 'Jean',
        verificationLink: 'https://example.com/verify',
      });

      expect(result).toContain('Bienvenue Jean!');
      expect(result).toContain('https://example.com/verify');
    });

    it('should render English template with variables', () => {
      const result = service.render('email-verification', Language.EN, {
        firstName: 'John',
        verificationLink: 'https://example.com/verify',
      });

      expect(result).toContain('Welcome John!');
      expect(result).toContain('https://example.com/verify');
    });

    it('should fall back to French when language template not found', () => {
      const result = service.render('email-verification', Language.FR, {
        firstName: 'Test',
        verificationLink: 'https://example.com/verify',
      });

      expect(result).toContain('Bienvenue Test!');
    });

    it('should throw error when template not found', () => {
      expect(() => {
        service.render('non-existent-template', Language.FR, {});
      }).toThrow('Template not found: non-existent-template');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Template not found: non-existent-template for language fr',
        undefined,
        'EmailTemplateService',
      );
    });

    it('should wrap content in base layout', () => {
      const result = service.render('email-verification', Language.FR, {
        firstName: 'Jean',
        verificationLink: 'https://example.com/verify',
      });

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('class="content"');
    });
  });
});
