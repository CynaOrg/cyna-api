import { Module } from '@nestjs/common';
import { AuthEventsHandler } from './auth-events.handler';
import { PaymentEventsHandler } from './payment-events.handler';
import { OrderEventsHandler } from './order-events.handler';
import { ContentEventsHandler } from './content-events.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthEventsHandler, PaymentEventsHandler, OrderEventsHandler, ContentEventsHandler],
})
export class HandlersModule {}
