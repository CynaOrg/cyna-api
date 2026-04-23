import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  EVENT_PATTERNS,
  Language,
  CynaLoggerService,
  ContactAutoReplyEvent,
  coerceLanguage,
} from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

@Controller()
export class ContentEventsHandler {
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

  @EventPattern(EVENT_PATTERNS.CONTENT.CONTACT_MESSAGE_RECEIVED)
  async handleContactMessageReceived(
    @Payload() data: Partial<ContactAutoReplyEvent>,
  ): Promise<void> {
    this.logger.log(
      `Handling CONTENT.CONTACT_MESSAGE_RECEIVED for ${data.email ?? 'unknown'}`,
      'ContentEventsHandler',
    );
    try {
      if (!data.email || !data.name || !data.subject) {
        this.logger.warn(
          `Skipping contact auto-reply: missing required fields (messageId=${data.messageId ?? 'n/a'})`,
          'ContentEventsHandler',
        );
        return;
      }
      const language = coerceLanguage(data.language);
      const subjects: Record<Language, string> = {
        [Language.FR]: 'Nous avons bien reçu votre message',
        [Language.EN]: "We've received your message",
      };
      const html = this.emailTemplateService.render('contact-auto-reply', language, {
        ...this.baseVars(),
        name: data.name,
        subject: data.subject,
        preheader:
          language === Language.EN
            ? "Thanks for reaching out — we'll get back to you within 48h"
            : 'Merci pour votre message — réponse sous 48h',
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle CONTENT.CONTACT_MESSAGE_RECEIVED: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
        'ContentEventsHandler',
      );
    }
  }
}
