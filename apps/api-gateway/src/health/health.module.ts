import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health Module
 * Provides health check endpoints
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
