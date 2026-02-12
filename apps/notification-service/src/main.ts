import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { NotificationModule } from './notification.module';

const logger = new Logger('NotificationService');

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'notification.emails',
      queueOptions: {
        durable: true,
      },
      prefetchCount: 10,
      noAck: true,
    },
  });

  await app.listen();
  logger.log('Notification Service is listening on notification.emails queue');
}

bootstrap();
