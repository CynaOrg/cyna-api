import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  EVENT_PATTERNS,
  Language,
  CynaLoggerService,
  OrderShippedEvent,
  CartAbandonedEvent,
} from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

@Controller()
export class OrderEventsHandler {
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

  private pickSubject(subjects: Record<Language, string>, language: Language): string {
    return subjects[language] ?? subjects[Language.FR];
  }

  @EventPattern(EVENT_PATTERNS.ORDER.SHIPPED)
  async handleOrderShipped(@Payload() data: OrderShippedEvent): Promise<void> {
    this.logger.log(
      `Handling ORDER.SHIPPED for order ${data.orderId} (lang=${data.language})`,
      'OrderEventsHandler',
    );
    try {
      await this.processOrderShipped(data);
    } catch (err) {
      this.logger.error(
        `Failed to handle ORDER.SHIPPED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'OrderEventsHandler',
      );
    }
  }

  private async processOrderShipped(data: OrderShippedEvent): Promise<void> {
    const subjects: Record<Language, string> = {
      [Language.FR]: `Votre commande ${data.orderNumber} est expédiée`,
      [Language.EN]: `Your order ${data.orderNumber} has shipped`,
    };
    const html = this.emailTemplateService.render('order-shipped', data.language, {
      ...this.baseVars(),
      orderNumber: data.orderNumber,
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl,
      preheader:
        data.language === Language.EN
          ? `Order ${data.orderNumber} is on its way`
          : `Commande ${data.orderNumber} en route`,
    });
    await this.emailService.sendEmail({
      to: data.email,
      subject: this.pickSubject(subjects, data.language),
      html,
    });
  }

  @EventPattern(EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED)
  async handleCartAbandoned(@Payload() data: CartAbandonedEvent): Promise<void> {
    this.logger.log(
      `Handling ORDER.CHECKOUT_EXPIRED for cart ${data.cartId} (lang=${data.language})`,
      'OrderEventsHandler',
    );
    try {
      await this.processCartAbandoned(data);
    } catch (err) {
      this.logger.error(
        `Failed to handle ORDER.CHECKOUT_EXPIRED for cart ${data.cartId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'OrderEventsHandler',
      );
    }
  }

  private async processCartAbandoned(data: CartAbandonedEvent): Promise<void> {
    const subjects: Record<Language, string> = {
      [Language.FR]: 'Votre panier vous attend sur CYNA',
      [Language.EN]: 'Your cart is waiting at CYNA',
    };
    const html = this.emailTemplateService.render('cart-abandoned', data.language, {
      ...this.baseVars(),
      itemsSummary: data.itemsSummary,
      itemCount: data.itemCount,
      preheader:
        data.language === Language.EN
          ? 'Complete your checkout — your cart is still saved'
          : 'Finalisez votre commande — votre panier est conservé',
    });
    await this.emailService.sendEmail({
      to: data.email,
      subject: this.pickSubject(subjects, data.language),
      html,
    });
  }
}
