import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CatalogController } from './catalog.controller';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [ConfigModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
