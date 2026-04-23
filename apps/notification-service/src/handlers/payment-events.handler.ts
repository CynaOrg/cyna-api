import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  EVENT_PATTERNS,
  Language,
  CynaLoggerService,
  PaymentConfirmedEvent,
  PaymentFailedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionPastDueEvent,
  SubscriptionCancelledEvent,
  RefundedEvent,
  LicensesIssuedEvent,
} from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

@Controller()
export class PaymentEventsHandler {
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

  private formatAmount(amount: number, currency: string, language: Language): string {
    const locale = language === Language.EN ? 'en-US' : 'fr-FR';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  }

  private pickSubject(subjects: Record<Language, string>, language: Language): string {
    return subjects[language] ?? subjects[Language.FR];
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.CONFIRMED)
  async handlePaymentConfirmed(@Payload() data: PaymentConfirmedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.CONFIRMED for order ${data.orderId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Confirmation de votre commande ${data.orderNumber}`,
        [Language.EN]: `Your order ${data.orderNumber} is confirmed`,
      };
      const html = this.emailTemplateService.render('order-confirmation', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        total: this.formatAmount(data.total, data.currency, data.language),
        itemsSummary: data.itemsSummary,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.CONFIRMED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.FAILED)
  async handlePaymentFailed(@Payload() data: PaymentFailedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.FAILED for order ${data.orderId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Echec du paiement pour ${data.orderNumber}`,
        [Language.EN]: `Payment failed for order ${data.orderNumber}`,
      };
      const html = this.emailTemplateService.render('payment-failed', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        error: data.error,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.FAILED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED)
  async handleSubscriptionCreated(@Payload() data: SubscriptionCreatedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.SUBSCRIPTION_CREATED for subscription ${data.subscriptionId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Bienvenue - Abonnement ${data.productName}`,
        [Language.EN]: `Welcome - Subscription ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-welcome', data.language, {
        ...this.baseVars(),
        productName: data.productName,
        billingPeriod: data.billingPeriod,
        price: this.formatAmount(data.price, data.currency, data.language),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_CREATED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED)
  async handleSubscriptionRenewed(@Payload() data: SubscriptionRenewedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.SUBSCRIPTION_RENEWED for ${data.subscriptionId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Renouvellement de votre abonnement ${data.productName}`,
        [Language.EN]: `Subscription ${data.productName} renewed`,
      };
      const html = this.emailTemplateService.render('subscription-renewal', data.language, {
        ...this.baseVars(),
        productName: data.productName,
        newPeriodEnd: data.newPeriodEnd,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_RENEWED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE)
  async handleSubscriptionPastDue(@Payload() data: SubscriptionPastDueEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.SUBSCRIPTION_PAST_DUE for ${data.subscriptionId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Paiement en attente - ${data.productName}`,
        [Language.EN]: `Payment past due - ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-past-due', data.language, {
        ...this.baseVars(),
        productName: data.productName,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_PAST_DUE for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED)
  async handleSubscriptionCancelled(@Payload() data: SubscriptionCancelledEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.SUBSCRIPTION_CANCELLED for ${data.subscriptionId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Annulation confirmee - ${data.productName}`,
        [Language.EN]: `Subscription cancelled - ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-cancellation', data.language, {
        ...this.baseVars(),
        productName: data.productName,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_CANCELLED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.LICENSES_ISSUED)
  async handleLicensesIssued(@Payload() data: LicensesIssuedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.LICENSES_ISSUED for order ${data.orderId} (${data.licenses.length} license(s), lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:4200');
      const licenses = data.licenses.map((l) => ({
        licenseKey: l.licenseKey,
        productName:
          data.language === Language.EN ? l.productSnapshot.nameEn : l.productSnapshot.nameFr,
        activationUrl: `${frontendUrl}/licenses/activate?token=${encodeURIComponent(l.activationToken)}`,
      }));
      const subjects: Record<Language, string> = {
        [Language.FR]:
          data.licenses.length > 1
            ? `Vos licences CYNA sont prêtes (${data.orderNumber})`
            : `Votre licence CYNA est prête (${data.orderNumber})`,
        [Language.EN]:
          data.licenses.length > 1
            ? `Your CYNA licenses are ready (${data.orderNumber})`
            : `Your CYNA license is ready (${data.orderNumber})`,
      };
      const html = this.emailTemplateService.render('license-delivery', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        licenseCount: data.licenses.length,
        hasSingleLicense: data.licenses.length === 1,
        licenses,
        preheader:
          data.language === Language.EN
            ? `Activate your ${data.licenses.length > 1 ? 'licenses' : 'license'} for order ${data.orderNumber}`
            : `Activez ${data.licenses.length > 1 ? 'vos licences' : 'votre licence'} pour la commande ${data.orderNumber}`,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.LICENSES_ISSUED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.REFUNDED)
  async handleRefunded(@Payload() data: RefundedEvent): Promise<void> {
    this.logger.log(
      `Handling PAYMENT.REFUNDED for order ${data.orderId} (lang=${data.language})`,
      'PaymentEventsHandler',
    );
    try {
      const subjects: Record<Language, string> = {
        [Language.FR]: `Remboursement traite - ${data.orderNumber}`,
        [Language.EN]: `Refund processed - ${data.orderNumber}`,
      };
      const html = this.emailTemplateService.render('refund-confirmation', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        refundAmount: this.formatAmount(data.refundAmount, data.currency, data.language),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: this.pickSubject(subjects, data.language),
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.REFUNDED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'PaymentEventsHandler',
      );
    }
  }
}
