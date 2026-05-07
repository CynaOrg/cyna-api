import { Module } from '@nestjs/common';
import { CynaCacheModule } from '@cyna-api/common';
import { HealthController } from './health.controller';
import { RedisHealthController } from './redis-health.controller';

/**
 * Health Module
 * Provides health check endpoints (gateway, redis).
 */
@Module({
  imports: [CynaCacheModule.forRoot()],
  controllers: [HealthController, RedisHealthController],
})
export class HealthModule {}
