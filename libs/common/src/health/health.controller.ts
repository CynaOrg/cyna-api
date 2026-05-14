import { Controller, Get, Inject } from '@nestjs/common';
import { HEALTH_SERVICE_NAME } from './health.constants';

/**
 * Reusable healthcheck controller for microservices that bootstrap in
 * hybrid mode (HTTP listener + RabbitMQ transport). Railway's TCP/HTTP
 * probe hits `/health` to verify liveness without going through RMQ.
 */
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(@Inject(HEALTH_SERVICE_NAME) private readonly serviceName: string) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
