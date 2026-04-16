import { Module } from '@nestjs/common';
import { AuthEventsHandler } from './auth-events.handler';
import { PaymentEventsHandler } from './payment-events.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthEventsHandler, PaymentEventsHandler],
})
export class HandlersModule {}
