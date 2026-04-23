import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CynaConfigModule, LoggerModule, SERVICE_NAMES, CynaCacheModule } from '@cyna-api/common';
import { S3Module } from '@cyna-api/s3';
import {
  Category,
  Product,
  ProductImage,
  ProductCharacteristic,
  StockReservation,
} from './entities';
import { CategoryService, ProductService, StockService, ImageService } from './services';
import { StockCleanupCron } from './cron';
import { CatalogController } from './controllers';
import { CatalogEventsPublisher } from './events';
import { catalogConfig } from './config';
import { InitialDataSeeder } from './seeds';
import { AddImageUploadColumns1739451600000 } from './migrations/1739451600000-AddImageUploadColumns';

@Module({
  imports: [
    CynaConfigModule,
    ConfigModule.forFeature(catalogConfig),
    LoggerModule,
    S3Module,
    ScheduleModule.forRoot(),
    CynaCacheModule.forRoot({ useMemoryFallback: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5433', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [Category, Product, ProductImage, ProductCharacteristic, StockReservation],
      migrations: [AddImageUploadColumns1739451600000],
      migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
      synchronize: process.env.DATABASE_SYNC === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([
      Category,
      Product,
      ProductImage,
      ProductCharacteristic,
      StockReservation,
    ]),
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
        name: SERVICE_NAMES.ANALYTICS,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'analytics_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [CatalogController],
  providers: [
    CategoryService,
    ProductService,
    StockService,
    ImageService,
    StockCleanupCron,
    CatalogEventsPublisher,
    InitialDataSeeder,
  ],
})
export class CatalogModule {}
