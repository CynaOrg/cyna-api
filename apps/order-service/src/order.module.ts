import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import {
  CynaConfigModule,
  HealthModule,
  LoggerModule,
  SERVICE_NAMES,
  CynaCacheModule,
  isDatabaseSyncEnabled,
} from '@cyna-api/common';
import { Cart, CartItem, Order, OrderItem } from './entities';
import { CartService, OrderService } from './services';
import { OrderController } from './controllers';
import { CartAbandonedCron } from './cron/cart-abandoned.cron';
import { PendingOrdersCleanupCron } from './cron/pending-orders-cleanup.cron';
import { GuestCartCleanupCron } from './cron/guest-cart-cleanup.cron';
import { RenameGuestEmailToCustomerEmail1776900000000 } from './migrations/1776900000000-RenameGuestEmailToCustomerEmail';
import { AddStripeInvoiceToOrders1777300000000 } from './migrations/1777300000000-AddStripeInvoiceToOrders';
import { AddAbandonedNotifiedAtToCarts1777400000000 } from './migrations/1777400000000-AddAbandonedNotifiedAtToCarts';

@Module({
  imports: [
    CynaConfigModule,
    HealthModule.forService('order-service'),
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
      entities: [Cart, CartItem, Order, OrderItem],
      migrations: [
        RenameGuestEmailToCustomerEmail1776900000000,
        AddStripeInvoiceToOrders1777300000000,
        AddAbandonedNotifiedAtToCarts1777400000000,
      ],
      migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
      synchronize: isDatabaseSyncEnabled(),
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([Cart, CartItem, Order, OrderItem]),
    ClientsModule.register([
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
        name: SERVICE_NAMES.USER,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'user.queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [OrderController],
  providers: [
    CartService,
    OrderService,
    CartAbandonedCron,
    PendingOrdersCleanupCron,
    GuestCartCleanupCron,
  ],
})
export class OrderModule {}
