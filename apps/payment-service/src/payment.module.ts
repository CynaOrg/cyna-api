import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CynaConfigModule,
  LoggerModule,
  SERVICE_NAMES,
  isDatabaseSyncEnabled,
} from '@cyna-api/common';
import { Subscription, LicenseKey, ProcessedWebhook } from './entities';
import { PaymentController, WebhookEventController } from './controllers';
import {
  StripeService,
  PaymentService,
  SubscriptionService,
  LicenseService,
  WebhookService,
} from './services';
import { AddProductSnapshotToLicenseKeys1776845407292 } from './migrations/1776845407292-AddProductSnapshotToLicenseKeys';
import { AddActivationFlowToLicenseKeys1777200000000 } from './migrations/1777200000000-AddActivationFlowToLicenseKeys';
import { AddStripeInvoiceUrlToSubscriptions1777300000001 } from './migrations/1777300000001-AddStripeInvoiceUrlToSubscriptions';

@Module({
  imports: [
    CynaConfigModule,
    LoggerModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5433', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [Subscription, LicenseKey, ProcessedWebhook],
      migrations: [
        AddProductSnapshotToLicenseKeys1776845407292,
        AddActivationFlowToLicenseKeys1777200000000,
        AddStripeInvoiceUrlToSubscriptions1777300000001,
      ],
      migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
      synchronize: isDatabaseSyncEnabled(),
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([Subscription, LicenseKey, ProcessedWebhook]),
    ClientsModule.register([
      {
        name: SERVICE_NAMES.ORDER,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'order.queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: SERVICE_NAMES.NOTIFICATION,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'notification.emails',
          queueOptions: { durable: true },
        },
      },
      {
        name: SERVICE_NAMES.CATALOG,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'catalog.queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: SERVICE_NAMES.USER,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'user.queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [PaymentController, WebhookEventController],
  providers: [StripeService, PaymentService, SubscriptionService, LicenseService, WebhookService],
})
export class PaymentModule {}
