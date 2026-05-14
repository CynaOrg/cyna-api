import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '@cyna-api/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let rabbit: { checkHealth: jest.Mock; getConnectionStatus: jest.Mock };

  beforeEach(async () => {
    rabbit = {
      checkHealth: jest.fn().mockReturnValue({ status: 'connected' }),
      getConnectionStatus: jest.fn().mockReturnValue(true),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_k: string, def?: string) => def ?? 'api-gateway'),
          },
        },
        { provide: RabbitMQService, useValue: rabbit },
      ],
    }).compile();
    controller = module.get(HealthController);
  });

  it('GET /health returns ok when RabbitMQ connected', () => {
    const res = controller.getHealth();
    expect(res.status).toBe('ok');
    expect(res.rabbitmq).toBe('connected');
    expect(res.version).toBe('1.0.0');
    expect(res.service).toBe('api-gateway');
    expect(typeof res.uptime).toBe('number');
    expect(typeof res.timestamp).toBe('string');
  });

  it('GET /health returns degraded when RabbitMQ disconnected', () => {
    rabbit.checkHealth.mockReturnValue({ status: 'disconnected' });
    const res = controller.getHealth();
    expect(res.status).toBe('degraded');
    expect(res.rabbitmq).toBe('disconnected');
  });

  it('GET /ready returns ready=true when RabbitMQ is connected', () => {
    const res = controller.getReadiness();
    expect(res.ready).toBe(true);
    expect(typeof res.timestamp).toBe('string');
  });

  it('GET /ready returns ready=false when RabbitMQ is disconnected', () => {
    rabbit.getConnectionStatus.mockReturnValue(false);
    const res = controller.getReadiness();
    expect(res.ready).toBe(false);
  });

  it('GET /live always returns alive=true', () => {
    const res = controller.getLiveness();
    expect(res.alive).toBe(true);
    expect(typeof res.timestamp).toBe('string');
  });
});
