import { Controller, Optional } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { EVENT_PATTERNS, Language, CynaLoggerService, CynaCacheService } from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';
import { StockLowEvent } from './interfaces/stock-low.event';

const STOCK_LOW_DEDUPE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

@Controller()
export class CatalogEventsHandler {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
    @Optional() private readonly cacheService?: CynaCacheService,
  ) {}

  @EventPattern(EVENT_PATTERNS.CATALOG.STOCK_LOW)
  async handleStockLow(@Payload() data: StockLowEvent): Promise<void> {
    this.logger.log(
      `Processing catalog.stock.low event for product: ${data.productId} (${data.sku}) - current: ${data.currentStock}, threshold: ${data.alertThreshold}`,
      'CatalogEventsHandler',
    );

    try {
      // Dedupe: skip if we already sent an alert recently for this product
      const dedupeKey = `stock-low-alerted:${data.productId}`;
      if (this.cacheService) {
        const alreadyAlerted = await this.cacheService.get<boolean>(dedupeKey);
        if (alreadyAlerted) {
          this.logger.log(
            `Skipping stock-low email for product ${data.productId} (already alerted within TTL window)`,
            'CatalogEventsHandler',
          );
          return;
        }
      }

      const to = this.configService.get<string>('STOCK_LOW_ALERT_EMAIL', 'admin@cyna.fr');
      const backofficeUrl = this.configService.get<string>(
        'BACKOFFICE_URL',
        'http://localhost:4200',
      );

      const detectedAtDate =
        data.detectedAt instanceof Date ? data.detectedAt : new Date(data.detectedAt);
      const detectedAtFormatted = this.formatDate(detectedAtDate);

      const subject = `⚠ Stock bas — ${data.productName} (${data.sku})`;

      const html = this.emailTemplateService.render('stock-low-alert', Language.FR, {
        productName: data.productName,
        sku: data.sku,
        currentStock: data.currentStock,
        alertThreshold: data.alertThreshold,
        detectedAt: detectedAtFormatted,
        backofficeUrl,
        productId: data.productId,
      });

      const sent = await this.emailService.sendEmail({
        to,
        subject,
        html,
      });

      if (sent) {
        this.logger.log(
          `Stock-low alert email sent to ${to} for product ${data.productId} (${data.sku})`,
          'CatalogEventsHandler',
        );

        if (this.cacheService) {
          await this.cacheService.set(dedupeKey, true, STOCK_LOW_DEDUPE_TTL_SECONDS);
        }
      } else {
        this.logger.warn(
          `Stock-low alert email NOT sent for product ${data.productId} (emailService returned false)`,
          'CatalogEventsHandler',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process catalog.stock.low event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsHandler',
      );
    }
  }

  private formatDate(date: Date): string {
    if (isNaN(date.getTime())) {
      return 'N/A';
    }
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  }
}
