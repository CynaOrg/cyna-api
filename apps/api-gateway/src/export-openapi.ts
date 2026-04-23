import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';

import { GatewayModule } from './gateway.module';
import { createOpenApiDocument } from './swagger.factory';

async function exportOpenApi() {
  const app = await NestFactory.create(GatewayModule, {
    logger: ['error', 'warn'],
    preview: true,
  });

  const document = createOpenApiDocument(app);
  const outputPath = resolve(process.cwd(), 'openapi.json');

  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  await app.close();

  console.log(`OpenAPI spec written to ${outputPath}`);
  process.exit(0);
}

exportOpenApi().catch((error) => {
  console.error('Failed to export OpenAPI spec:', error);
  process.exit(1);
});
