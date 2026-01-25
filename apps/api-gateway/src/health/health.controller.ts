import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService, Public } from '@cyna-api/common';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  service: string;
  version: string;
  rabbitmq: 'connected' | 'disconnected';
  uptime: number;
}

/**
 * Health Controller
 * Provides health check endpoint for the API Gateway
 */
@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
        timestamp: { type: 'string', format: 'date-time' },
        service: { type: 'string' },
        version: { type: 'string' },
        rabbitmq: { type: 'string', enum: ['connected', 'disconnected'] },
        uptime: { type: 'number', description: 'Uptime in seconds' },
      },
    },
  })
  getHealth(): HealthResponse {
    const rabbitmqHealth = this.rabbitMQService.checkHealth();

    const status = rabbitmqHealth.status === 'connected' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      service: this.configService.get<string>('APP_NAME', 'api-gateway'),
      version: '1.0.0',
      rabbitmq: rabbitmqHealth.status,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to accept requests',
    schema: {
      type: 'object',
      properties: {
        ready: { type: 'boolean' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getReadiness(): { ready: boolean; timestamp: string } {
    const rabbitmqConnected = this.rabbitMQService.getConnectionStatus();

    return {
      ready: rabbitmqConnected,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    schema: {
      type: 'object',
      properties: {
        alive: { type: 'boolean' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getLiveness(): { alive: boolean; timestamp: string } {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }
}
