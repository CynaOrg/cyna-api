import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CynaConfigModule, LoggerModule, SERVICE_NAMES } from '@cyna-api/common';
import { User } from './entities/user.entity';
import { UserAddress } from './entities/user-address.entity';
import { UserController } from './controllers/user.controller';
import { UserAdminController } from './controllers/user-admin.controller';
import { UserAddressController } from './controllers/user-address.controller';
import { UserService } from './services/user.service';
import { UserAdminService } from './services/user-admin.service';
import { UserAddressService } from './services/user-address.service';
import { CreateUserAddressesTable1745500000000 } from './migrations/1745500000000-CreateUserAddressesTable';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.DATABASE_PASSWORD) {
  throw new Error('DATABASE_PASSWORD must be set in production');
}

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
      entities: [User, UserAddress],
      migrations: [CreateUserAddressesTable1745500000000],
      migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
      synchronize: !isProduction && process.env.DATABASE_SYNC === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([User, UserAddress]),
    ClientsModule.register([
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
        name: SERVICE_NAMES.AUTH,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'auth.queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [UserController, UserAdminController, UserAddressController],
  providers: [UserService, UserAdminService, UserAddressService],
})
export class UserModule {}
