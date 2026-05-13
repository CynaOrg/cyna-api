import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CynaConfigModule,
  LoggerModule,
  SERVICE_NAMES,
  CynaCacheModule,
  isDatabaseSyncEnabled,
} from '@cyna-api/common';
import { S3Module } from '@cyna-api/s3';
import { CarouselSlide, HeroText, TopProductConfig, ContactMessage } from './entities';
import {
  CarouselService,
  HeroTextService,
  TopProductsService,
  ContactMessageService,
  ContentImageService,
} from './services';
import { ContentController } from './controllers';
import { ContentEventsPublisher } from './events';
import { contentConfig } from './config';
import { ContentDataSeeder } from './seeds';

@Module({
  imports: [
    CynaConfigModule,
    ConfigModule.forFeature(contentConfig),
    LoggerModule,
    ScheduleModule.forRoot(),
    CynaCacheModule.forRoot({ useMemoryFallback: true }),
    S3Module,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5433', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [CarouselSlide, HeroText, TopProductConfig, ContactMessage],
      synchronize: isDatabaseSyncEnabled(),
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([CarouselSlide, HeroText, TopProductConfig, ContactMessage]),
    ClientsModule.register([
      {
        name: SERVICE_NAMES.NOTIFICATION,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'notification.emails',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: SERVICE_NAMES.CATALOG,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'catalog.queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [ContentController],
  providers: [
    CarouselService,
    HeroTextService,
    TopProductsService,
    ContactMessageService,
    ContentImageService,
    ContentEventsPublisher,
    ContentDataSeeder,
  ],
})
export class ContentModule {}
