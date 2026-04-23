import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiConfig() {
  return new DocumentBuilder()
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
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildOpenApiConfig());
}
