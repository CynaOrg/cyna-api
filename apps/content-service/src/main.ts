import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ContentModule } from './content.module';

const logger = new Logger('ContentService');

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ContentModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'content.queue',
      queueOptions: {
        durable: true,
      },
      prefetchCount: 10,
      noAck: true,
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
  logger.log('Content Service is listening on content.queue');
}

bootstrap();
