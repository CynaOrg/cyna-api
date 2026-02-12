import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@cyna-api/common';
import { WebhookService } from '../services/webhook.service';
import { WebhookPayloadDto } from '../dto/webhook-payload.dto';

@Controller()
export class WebhookEventController {
  private readonly logger = new Logger(WebhookEventController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @EventPattern(EVENT_PATTERNS.PAYMENT.WEBHOOK_RECEIVED)
  async handleWebhook(@Payload() payload: WebhookPayloadDto) {
    try {
      await this.webhookService.handleWebhookEvent(payload);
    } catch (error) {
      this.logger.error(
        `Failed to process webhook ${payload.eventId}: ${error instanceof Error ? error.message : 'Unknown'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
