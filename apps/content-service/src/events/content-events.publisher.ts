import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  EVENT_PATTERNS,
  CynaLoggerService,
  Language,
  TopProductsUpdatedEvent,
} from '@cyna-api/common';

export interface ContactMessageReceivedEvent {
  messageId: string;
  name: string;
  email: string;
  subject: string;
  language?: Language;
}

@Injectable()
export class ContentEventsPublisher {
  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async emitContactMessageReceived(data: ContactMessageReceivedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CONTENT.CONTACT_MESSAGE_RECEIVED, data);
      this.logger.log(
        `Emitted contact.message.received event for message: ${data.messageId}`,
        'ContentEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit contact.message.received event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'ContentEventsPublisher',
      );
    }
  }

  emitTopProductsUpdated(data: TopProductsUpdatedEvent): void {
    if (data.added.length === 0 && data.removed.length === 0) {
      return;
    }
    try {
      this.catalogClient.emit(EVENT_PATTERNS.CONTENT.TOP_PRODUCTS_UPDATED, data);
      this.logger.log(
        `Emitted top_products.updated (${data.productType}) +${data.added.length} -${data.removed.length}`,
        'ContentEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit top_products.updated: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'ContentEventsPublisher',
      );
    }
  }
}
