import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './swagger.factory';
import { I18nService } from 'nestjs-i18n';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';

import { GatewayModule } from './gateway.module';
import {
  GlobalExceptionFilter,
  LoggingInterceptor,
  TransformInterceptor,
  CorrelationIdInterceptor,
} from '@cyna-api/common';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const i18nService = app.get<I18nService<Record<string, unknown>>>(I18nService);
  const logger = new Logger('Bootstrap');

  // Get configuration
  const appName = configService.get<string>('APP_NAME', 'cyna-api');
  const port = configService.get<number>('APP_PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  const apiVersion = configService.get<string>('API_VERSION', 'v1');
  // Swagger is always disabled in production, regardless of SWAGGER_ENABLED,
  // to avoid leaking the full API surface to opportunistic recon.
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled = !isProduction && configService.get<boolean>('SWAGGER_ENABLED', false);
  const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:4200');

  // Raw body for Stripe webhook (BEFORE other middlewares)
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

  // Security middlewares
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS configuration
  app.enableCors({
    origin: corsOrigins.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept-Language',
      'x-correlation-id',
      'X-Session-Id',
      'x-lang',
      'X-Client-Type',
    ],
  });

  // Global prefix (exclude webhook endpoint)
  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`, {
    exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(
    new CorrelationIdInterceptor(),
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(i18nService));

  // Swagger documentation
  if (swaggerEnabled) {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`Swagger documentation available at /${swaggerPath}`);
  }

  await app.listen(port);

  logger.log(`${appName} is running on port ${port}`);
  logger.log(`API available at http://localhost:${port}/${apiPrefix}/${apiVersion}`);
}

bootstrap();
