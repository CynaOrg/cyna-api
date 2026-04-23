import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CynaConfigModule, LoggerModule, SERVICE_NAMES } from '@cyna-api/common';
import { User } from './entities/user.entity';
import { UserController } from './controllers/user.controller';
import { UserAdminController } from './controllers/user-admin.controller';
import { UserService } from './services/user.service';
import { UserAdminService } from './services/user-admin.service';

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
      entities: [User],
      synchronize: process.env.DATABASE_SYNC === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([User]),
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
    ]),
  ],
  controllers: [UserController, UserAdminController],
  providers: [UserService, UserAdminService],
})
export class UserModule {}
