import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CynaConfigModule, LoggerModule, SERVICE_NAMES } from '@cyna-api/common';
import { catalogConfig } from './config';
import { Category, Product } from './entities';
import { CategoryService, ProductService } from './services';
import { CategoryController, ProductController } from './controllers';

@Module({
  imports: [
    // Common modules
    CynaConfigModule,
    LoggerModule,
    ConfigModule.forFeature(catalogConfig),

    // Schedule for cron jobs (stock cleanup)
    ScheduleModule.forRoot(),

    // Database
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [Category, Product],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([Category, Product]),

    // RabbitMQ clients for communication with other services
    ClientsModule.register([
      {
        name: SERVICE_NAMES.NOTIFICATION,
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
          ],
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
          urls: [
            process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
          ],
          queue: 'analytics.events',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [CategoryController, ProductController],
  providers: [CategoryService, ProductService],
})
export class CatalogModule {}
