import { Module } from '@nestjs/common';
import { AuthEventsHandler } from './auth-events.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthEventsHandler],
})
export class HandlersModule {}
