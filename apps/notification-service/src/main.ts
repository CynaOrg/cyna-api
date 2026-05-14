import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { NotificationModule } from './notification.module';

const logger = new Logger('NotificationService');

/**
 * Hybrid bootstrap: HTTP listener (for /health probes from Railway) +
 * RabbitMQ microservice listener (for business message patterns). The
 * HTTP port is taken from PORT (Railway-provided) or HEALTH_PORT, with
 * 3006 as the local-dev default.
 */
async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  const healthPort = parseInt(process.env.PORT || process.env.HEALTH_PORT || '3006', 10);

  const app = await NestFactory.create(NotificationModule);

  app.connectMicroservice<MicroserviceOptions>({
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

  await app.startAllMicroservices();
  await app.listen(healthPort);

  logger.log(
    `Notification Service is listening on notification.emails (RMQ) and :${healthPort} (health)`,
  );
}

bootstrap();
