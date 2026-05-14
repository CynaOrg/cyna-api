import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CynaConfigModule,
  HealthModule,
  LoggerModule,
  SERVICE_NAMES,
  CynaCacheModule,
  isDatabaseSyncEnabled,
} from '@cyna-api/common';
import { AnalyticsCache } from './entities';
import { DashboardService, SalesService, ExportService } from './services';
import { AnalyticsController } from './controllers';
import { analyticsConfig } from './config';

@Module({
  imports: [
    CynaConfigModule,
    HealthModule.forService('analytics-service'),
    ConfigModule.forFeature(analyticsConfig),
    LoggerModule,
    ScheduleModule.forRoot(),
    CynaCacheModule.forRoot({ useMemoryFallback: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5433', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [AnalyticsCache],
      synchronize: isDatabaseSyncEnabled(),
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([AnalyticsCache]),
    ClientsModule.register([
      {
        name: SERVICE_NAMES.ORDER,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'order.queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: SERVICE_NAMES.PAYMENT,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'payment.queue',
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
  controllers: [AnalyticsController],
  providers: [DashboardService, SalesService, ExportService],
})
export class AnalyticsModule {}
