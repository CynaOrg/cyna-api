import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { NotificationModule } from './notification.module';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('NotificationService');

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(NotificationModule);
  const configService = appContext.get(ConfigService);

  const rabbitmqUrl = configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');

  await appContext.close();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'notification.emails',
        queueOptions: {
          durable: true,
        },
        prefetchCount: 10,
        noAck: false,
      },
    },
  );

  await app.listen();
  logger.log('Notification Service is listening on notification.emails queue');
}

bootstrap();
