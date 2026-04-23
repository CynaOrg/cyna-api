import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, EVENT_PATTERNS, CynaLoggerService, Language } from '@cyna-api/common';

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
}
