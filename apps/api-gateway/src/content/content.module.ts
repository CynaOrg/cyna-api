import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentController } from './content.controller';
import { ContentAdminController } from './content-admin.controller';
import { ContentService } from './content.service';

@Module({
  imports: [ConfigModule],
  controllers: [ContentController, ContentAdminController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
