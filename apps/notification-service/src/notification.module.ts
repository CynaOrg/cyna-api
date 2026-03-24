import { Module } from '@nestjs/common';
import { CynaConfigModule, LoggerModule } from '@cyna-api/common';
import { EmailModule } from './email/email.module';
import { HandlersModule } from './handlers/handlers.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [CynaConfigModule, LoggerModule, EmailModule, HandlersModule],
  controllers: [HealthController],
})
export class NotificationModule {}
