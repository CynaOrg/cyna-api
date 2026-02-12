import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AnalyticsModule } from './analytics.module';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('AnalyticsService');

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AnalyticsModule);
  const configService = appContext.get(ConfigService);

  const rabbitmqUrl = configService.get<string>(
    'RABBITMQ_URL',
    'amqp://guest:guest@localhost:5672',
  );

  await appContext.close();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AnalyticsModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'analytics.queue',
      queueOptions: {
        durable: true,
      },
      prefetchCount: 10,
      noAck: false,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen();
  logger.log('Analytics Service is listening on analytics.queue');
}

bootstrap();
