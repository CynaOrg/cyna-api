import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { CatalogModule } from './catalog.module';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('CatalogService');

async function bootstrap() {
  // Create application context to access ConfigService
  const appContext = await NestFactory.createApplicationContext(CatalogModule);
  const configService = appContext.get(ConfigService);

  const rabbitmqUrl = configService.get<string>(
    'RABBITMQ_URL',
    'amqp://guest:guest@localhost:5672',
  );

  await appContext.close();

  // Create microservice with RabbitMQ transport
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CatalogModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'catalog.queue',
        queueOptions: {
          durable: true,
        },
        prefetchCount: 10,
        noAck: false,
      },
    },
  );

  // Global validation pipe
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
  logger.log('Catalog Service is listening on catalog.queue');
}

bootstrap();
