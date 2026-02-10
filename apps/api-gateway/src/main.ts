import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

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
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', true);
  const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:4200');

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
    ],
  });

  // Global prefix
  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`);

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
    const config = new DocumentBuilder()
      .setTitle('CYNA API')
      .setDescription('B2B Cybersecurity E-commerce Platform API')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'JWT-auth',
      )
      .addTag('Health', 'Health check endpoints')
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Catalog', 'Product catalog endpoints')
      .addTag('Orders', 'Order management endpoints')
      .addTag('Payments', 'Payment and subscription endpoints')
      .addTag('Content', 'CMS content endpoints')
      .addTag('Analytics', 'Analytics and reporting endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
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
