import { Controller, Get, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public, RedisHealthService, RedisHealthResult } from '@cyna-api/common';

@ApiTags('Health')
@Controller('health')
export class RedisHealthController {
  constructor(private readonly redisHealth: RedisHealthService) {}

  @Get('redis')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redis health check' })
  @ApiResponse({
    status: 200,
    description: 'Redis is up',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['up', 'down'] },
        store: { type: 'string', enum: ['redis', 'memory'] },
        latencyMs: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Redis is down' })
  async getRedisHealth(): Promise<RedisHealthResult> {
    const result = await this.redisHealth.probe();
    if (result.status !== 'up') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
