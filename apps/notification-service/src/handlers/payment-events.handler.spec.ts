import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { PaymentEventsHandler } from './payment-events.handler';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

describe('PaymentEventsHandler', () => {
  let handler: PaymentEventsHandler;
  let mockEmailService: { sendEmail: jest.Mock };
  let mockEmailTemplateService: { render: jest.Mock };
  let mockLogger: { log: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    mockEmailService = { sendEmail: jest.fn().mockResolvedValue(true) };
    mockEmailTemplateService = { render: jest.fn().mockReturnValue('<html>ok</html>') };
    mockLogger = { log: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsHandler,
        { provide: EmailService, useValue: mockEmailService },
        { provide: EmailTemplateService, useValue: mockEmailTemplateService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => {
              const config: Record<string, string> = {
                FRONTEND_URL: 'https://app.cyna.test',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        { provide: CynaLoggerService, useValue: mockLogger },
      ],
    }).compile();

    handler = module.get<PaymentEventsHandler>(PaymentEventsHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePaymentConfirmed', () => {
    it('renders order-confirmation in the payload language', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        total: 100,
        currency: 'EUR',
        itemsSummary: 'SOC Pro x1',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'order-confirmation',
        Language.EN,
        expect.objectContaining({
          orderNumber: 'ORD-001',
          itemsSummary: 'SOC Pro x1',
          frontendUrl: 'https://app.cyna.test',
        }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your order ORD-001 is confirmed',
        }),
      );
    });

    it('passes invoiceUrl to the template when the event carries one', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        total: 100,
        currency: 'EUR',
        itemsSummary: 'SOC Pro x1',
        invoiceUrl: 'https://stripe.test/receipt/ch_abc',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'order-confirmation',
        Language.FR,
        expect.objectContaining({
          invoiceUrl: 'https://stripe.test/receipt/ch_abc',
        }),
      );
    });

    it('formats total as a localized currency string', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        total: 1234.5,
        currency: 'EUR',
        itemsSummary: 'Item x1',
      });

      const renderCall = mockEmailTemplateService.render.mock.calls[0];
      const variables = renderCall[2];
      expect(typeof variables.total).toBe('string');
      expect(variables.total).toMatch(/1,234\.50/);
    });

    it('falls back to French subject when language is unknown', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-2',
        orderNumber: 'ORD-002',
        userId: null,
        email: 'guest@example.com',
        language: 'de' as unknown as Language,
        total: 50,
        currency: 'EUR',
        itemsSummary: 'Item x1',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Confirmation'),
        }),
      );
    });

    it('swallows EmailService failures without throwing', async () => {
      mockEmailService.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(
        handler.handlePaymentConfirmed({
          orderId: 'o-3',
          orderNumber: 'ORD-003',
          userId: 'u-3',
          email: 'user@example.com',
          language: Language.FR,
          total: 10,
          currency: 'EUR',
          itemsSummary: 'Item x1',
        }),
      ).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handlePaymentFailed', () => {
    it('renders payment-failed in the payload language', async () => {
      await handler.handlePaymentFailed({
        orderId: 'o-4',
        orderNumber: 'ORD-004',
        userId: 'u-4',
        email: 'user@example.com',
        language: Language.FR,
        error: 'Card declined',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'payment-failed',
        Language.FR,
        expect.objectContaining({ orderNumber: 'ORD-004', error: 'Card declined' }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Echec du paiement pour ORD-004',
        }),
      );
    });
  });

  describe('handleSubscriptionCreated', () => {
    it('renders subscription-welcome with formatted price', async () => {
      await handler.handleSubscriptionCreated({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        productName: 'SOC Pro',
        billingPeriod: 'monthly',
        price: 49,
        currency: 'EUR',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'subscription-welcome',
        Language.EN,
        expect.objectContaining({ productName: 'SOC Pro', billingPeriod: 'monthly' }),
      );
    });
  });

  describe('handleSubscriptionRenewed', () => {
    it('renders subscription-renewal', async () => {
      await handler.handleSubscriptionRenewed({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        productName: 'SOC Pro',
        newPeriodEnd: '2026-05-01T00:00:00.000Z',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'subscription-renewal',
        Language.FR,
        expect.objectContaining({ newPeriodEnd: '2026-05-01T00:00:00.000Z' }),
      );
    });
  });

  describe('handleSubscriptionPastDue', () => {
    it('renders subscription-past-due', async () => {
      await handler.handleSubscriptionPastDue({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        productName: 'SOC Pro',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'subscription-past-due',
        Language.EN,
        expect.objectContaining({ productName: 'SOC Pro' }),
      );
    });
  });

  describe('handleSubscriptionCancelled', () => {
    it('renders subscription-cancellation', async () => {
      await handler.handleSubscriptionCancelled({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        productName: 'SOC Pro',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'subscription-cancellation',
        Language.FR,
        expect.objectContaining({ productName: 'SOC Pro' }),
      );
    });
  });

  describe('handleRefunded', () => {
    it('renders refund-confirmation with formatted amount', async () => {
      await handler.handleRefunded({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        refundAmount: 100,
        currency: 'EUR',
      });

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'refund-confirmation',
        Language.FR,
        expect.objectContaining({ orderNumber: 'ORD-001' }),
      );
    });
  });

  describe('handleLicensesIssued', () => {
    const issuedEvent = {
      orderId: 'order-1',
      orderNumber: 'ORD-001',
      userId: 'user-1',
      email: 'user@example.com',
      language: Language.FR,
      licenses: [
        {
          licenseId: 'lic-1',
          licenseKey: 'CYNA-AAAA-BBBB-CCCC-DDDD',
          productSnapshot: { nameFr: 'Antivirus Pro', nameEn: 'Antivirus Pro EN', slug: 'av' },
          activationToken: 'raw-token-1',
          activationExpiresAt: '2026-05-23T00:00:00.000Z',
        },
      ],
    };

    it('renders license-delivery with activation URLs built from FRONTEND_URL', async () => {
      await handler.handleLicensesIssued(issuedEvent);

      expect(mockEmailTemplateService.render).toHaveBeenCalledWith(
        'license-delivery',
        Language.FR,
        expect.objectContaining({
          orderNumber: 'ORD-001',
          licenseCount: 1,
          hasSingleLicense: true,
          licenses: [
            expect.objectContaining({
              licenseKey: 'CYNA-AAAA-BBBB-CCCC-DDDD',
              productName: 'Antivirus Pro',
              activationUrl: 'https://app.cyna.test/licenses/activate?token=raw-token-1',
            }),
          ],
        }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Votre licence CYNA est prête (ORD-001)',
        }),
      );
    });

    it('URL-encodes the raw token to survive punctuation characters', async () => {
      await handler.handleLicensesIssued({
        ...issuedEvent,
        licenses: [{ ...issuedEvent.licenses[0], activationToken: 'foo/bar+baz==' }],
      });

      const callArgs = mockEmailTemplateService.render.mock.calls[0][2];
      expect(callArgs.licenses[0].activationUrl).toBe(
        'https://app.cyna.test/licenses/activate?token=foo%2Fbar%2Bbaz%3D%3D',
      );
    });

    it('pluralizes subject and uses nameEn for English payloads with multiple licenses', async () => {
      await handler.handleLicensesIssued({
        ...issuedEvent,
        language: Language.EN,
        licenses: [
          issuedEvent.licenses[0],
          {
            licenseId: 'lic-2',
            licenseKey: 'CYNA-1111-2222-3333-4444',
            productSnapshot: { nameFr: 'EDR', nameEn: 'EDR EN', slug: 'edr' },
            activationToken: 'raw-token-2',
            activationExpiresAt: '2026-05-23T00:00:00.000Z',
          },
        ],
      });

      const callArgs = mockEmailTemplateService.render.mock.calls[0][2];
      expect(callArgs.licenses[0].productName).toBe('Antivirus Pro EN');
      expect(callArgs.licenses[1].productName).toBe('EDR EN');
      expect(callArgs.hasSingleLicense).toBe(false);
      expect(callArgs.licenseCount).toBe(2);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Your CYNA licenses are ready (ORD-001)' }),
      );
    });

    it('swallows render/send failures instead of crashing the event loop', async () => {
      mockEmailTemplateService.render.mockImplementationOnce(() => {
        throw new Error('template broken');
      });

      await expect(handler.handleLicensesIssued(issuedEvent)).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
