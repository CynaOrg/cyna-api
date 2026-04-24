import { Module } from '@nestjs/common';
import { AuthEventsHandler } from './auth-events.handler';
import { CatalogEventsHandler } from './catalog-events.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthEventsHandler, CatalogEventsHandler],
})
export class HandlersModule {}
