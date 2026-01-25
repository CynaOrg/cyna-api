import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('AuthService');

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AuthModule);
  const configService = appContext.get(ConfigService);

  const rabbitmqUrl = configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');

  await appContext.close();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'auth.queue',
        queueOptions: {
          durable: true,
        },
        prefetchCount: 10,
        noAck: false,
      },
    },
  );

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
  logger.log('Auth Service is listening on auth.queue');
}

bootstrap();
