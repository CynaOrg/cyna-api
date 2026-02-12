import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CynaConfigModule, LoggerModule, SERVICE_NAMES } from '@cyna-api/common';
import authConfig from './config/auth.config';
import {
  User,
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

@Module({
  imports: [
    CynaConfigModule,
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
      entities: [
        User,
        Admin,
        Admin2FACode,
        PasswordResetToken,
        EmailVerificationToken,
        RefreshToken,
      ],
      synchronize: process.env.DATABASE_SYNC === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([
      User,
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
