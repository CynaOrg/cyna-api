import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CatalogController } from './catalog.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [ConfigModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
