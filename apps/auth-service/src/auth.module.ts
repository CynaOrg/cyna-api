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
  isDatabaseSyncEnabled,
} from '@cyna-api/common';
import authConfig from './config/auth.config';
import {
  Admin,
  Admin2FACode,
  PasswordResetToken,
  EmailVerificationToken,
  RefreshToken,
} from './entities';
import {
  PasswordService,
  TokenService,
  TwoFactorService,
  AuthService,
  AdminAuthService,
} from './services';
import { AuthController, AdminAuthController } from './controllers';
import { AuthEventsPublisher } from './events/auth-events.publisher';
import { CleanupService } from './cron/cleanup.service';
import { AdminSeedService } from './seeds/admin-seed.service';
import { HashAdmin2FACodes1777600000000 } from './migrations/1777600000000-HashAdmin2FACodes';

@Module({
  imports: [
    CynaConfigModule,
    HealthModule.forService('auth-service'),
    LoggerModule,
    ConfigModule.forFeature(authConfig),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [Admin, Admin2FACode, PasswordResetToken, EmailVerificationToken, RefreshToken],
      migrations: [HashAdmin2FACodes1777600000000],
      migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
      synchronize: isDatabaseSyncEnabled(),
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([
      Admin,
      Admin2FACode,
      PasswordResetToken,
      EmailVerificationToken,
      RefreshToken,
    ]),
    ClientsModule.register([
      {
        name: SERVICE_NAMES.NOTIFICATION,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'notification.emails',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: SERVICE_NAMES.PAYMENT,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'payment.queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: SERVICE_NAMES.USER,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'user.queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [
    PasswordService,
    TokenService,
    TwoFactorService,
    AuthService,
    AdminAuthService,
    AuthEventsPublisher,
    CleanupService,
    AdminSeedService,
  ],
})
export class AuthModule {}
