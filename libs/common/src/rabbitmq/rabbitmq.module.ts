import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RabbitMQService } from './rabbitmq.service';
import { SERVICE_NAMES } from './patterns';
import { QUEUES } from './queues';

export interface RabbitMQModuleOptions {
  /**
   * Whether to register service clients (for API Gateway)
   */
  registerClients?: boolean;
}

interface ClientAsyncOptions {
  name: string;
  useFactory: (configService: ConfigService) => {
    transport: typeof Transport.RMQ;
    options: {
      urls: string[];
      queue: string;
      queueOptions: { durable: boolean };
      noAck: boolean;
      prefetchCount: number;
    };
  };
  inject: [typeof ConfigService];
}

/**
 * RabbitMQ Module
 * Provides connection management and optionally service clients
 */
@Global()
@Module({})
export class RabbitMQModule {
  /**
   * Register the module for root (API Gateway)
   * Includes all service clients for microservice communication
   */
  static forRoot(options: RabbitMQModuleOptions = {}): DynamicModule {
    const { registerClients = false } = options;

    const imports: DynamicModule['imports'] = [ConfigModule];

    if (registerClients) {
      imports.push(
        ClientsModule.registerAsync([
          createClientOptions(SERVICE_NAMES.AUTH, QUEUES.AUTH.name),
          createClientOptions(SERVICE_NAMES.CATALOG, QUEUES.CATALOG.name),
          createClientOptions(SERVICE_NAMES.ORDER, QUEUES.ORDER.name),
          createClientOptions(SERVICE_NAMES.PAYMENT, QUEUES.PAYMENT.name),
          createClientOptions(SERVICE_NAMES.USER, QUEUES.USER.name),
          createClientOptions(SERVICE_NAMES.CONTENT, QUEUES.CONTENT.name),
          createClientOptions(SERVICE_NAMES.NOTIFICATION, 'notification.queue'),
          createClientOptions(SERVICE_NAMES.ANALYTICS, 'analytics.queue'),
        ]),
      );
    }

    return {
      module: RabbitMQModule,
      imports,
      providers: [RabbitMQService],
      exports: [
        RabbitMQService,
        ...(registerClients ? [ClientsModule] : []),
      ],
    };
  }

  /**
   * Register the module for microservices
   * Only includes connection management, no clients
   */
  static forMicroservice(): DynamicModule {
    return {
      module: RabbitMQModule,
      imports: [ConfigModule],
      providers: [RabbitMQService],
      exports: [RabbitMQService],
    };
  }
}

/**
 * Helper function to create client options for a service
 */
function createClientOptions(name: string, queue: string): ClientAsyncOptions {
  return {
    name,
    useFactory: (configService: ConfigService) => ({
      transport: Transport.RMQ,
      options: {
        urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
        queue,
        queueOptions: {
          durable: true,
        },
        noAck: true,
        prefetchCount: 10,
      },
    }),
    inject: [ConfigService],
  };
}
