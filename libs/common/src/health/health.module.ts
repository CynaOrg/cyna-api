import { DynamicModule, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HEALTH_SERVICE_NAME } from './health.constants';

@Module({})
export class HealthModule {
  /**
   * Register the healthcheck module for a microservice.
   * @param serviceName Identifier returned in the /health payload.
   */
  static forService(serviceName: string): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: HEALTH_SERVICE_NAME, useValue: serviceName }],
    };
  }
}
