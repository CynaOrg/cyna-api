import { Module } from '@nestjs/common';
import {
  CynaConfigModule,
  LoggerModule,
  CynaI18nModule,
  RabbitMQModule,
} from '@cyna-api/common';
import { HealthModule } from './health/health.module';

/**
 * Gateway Module
 * Root module for the API Gateway application
 */
@Module({
  imports: [
    // Core modules from @cyna-api/common
    CynaConfigModule,
    LoggerModule,
    CynaI18nModule,
    RabbitMQModule.forRoot({ registerClients: true }),

    // Feature modules
    HealthModule,
  ],
})
export class GatewayModule {}
