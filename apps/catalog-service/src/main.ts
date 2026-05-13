import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { I18nValidationPipe } from 'nestjs-i18n';
import { CatalogModule } from './catalog.module';

const logger = new Logger('CatalogService');

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CatalogModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'catalog.queue',
      queueOptions: {
        durable: true,
      },
      prefetchCount: 10,
      noAck: true,
    },
  });

  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen();
  logger.log('Catalog Service is listening on catalog.queue');
}

bootstrap();
