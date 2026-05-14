import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { I18nValidationPipe } from 'nestjs-i18n';
import { CatalogModule } from './catalog.module';

const logger = new Logger('CatalogService');

/**
 * Hybrid bootstrap: HTTP listener (for /health probes from Railway) +
 * RabbitMQ microservice listener (for business message patterns). The
 * HTTP port is taken from PORT (Railway-provided) or HEALTH_PORT, with
 * 3002 as the local-dev default.
 */
async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  const healthPort = parseInt(process.env.PORT || process.env.HEALTH_PORT || '3002', 10);

  const app = await NestFactory.create(CatalogModule);

  app.connectMicroservice<MicroserviceOptions>({
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

  await app.startAllMicroservices();
  await app.listen(healthPort);

  logger.log(`Catalog Service is listening on catalog.queue (RMQ) and :${healthPort} (health)`);
}

bootstrap();
