import { Module } from '@nestjs/common';
import { CynaConfigModule, HealthModule, LoggerModule } from '@cyna-api/common';
import { EmailModule } from './email/email.module';
import { HandlersModule } from './handlers/handlers.module';

@Module({
  imports: [
    CynaConfigModule,
    HealthModule.forService('notification-service'),
    LoggerModule,
    EmailModule,
    HandlersModule,
  ],
})
export class NotificationModule {}
