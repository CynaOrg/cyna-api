import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EXCHANGES, ExchangeDefinition } from './exchanges';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

/**
 * RabbitMQ Service
 * Handles connection management and exchange declaration
 */
@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Connect to RabbitMQ and declare exchanges
   */
  async connect(): Promise<void> {
    try {
      const url = this.configService.get<string>('RABBITMQ_URL');

      if (!url) {
        this.logger.warn('RABBITMQ_URL not configured, skipping RabbitMQ connection');
        return;
      }

      this.logger.log('Connecting to RabbitMQ...');

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      // Handle connection events
      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
      });

      // Declare all exchanges
      await this.declareExchanges();

      this.isConnected = true;
      this.logger.log('Successfully connected to RabbitMQ');
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${(error as Error).message}`);
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.isConnected = false;
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(`Error disconnecting from RabbitMQ: ${(error as Error).message}`);
    }
  }

  /**
   * Declare all exchanges defined in exchanges.ts
   */
  private async declareExchanges(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const exchangeEntries = Object.entries(EXCHANGES) as [string, ExchangeDefinition][];

    for (const [key, exchange] of exchangeEntries) {
      await this.channel.assertExchange(exchange.name, exchange.type, exchange.options);
      this.logger.debug(`Declared exchange: ${exchange.name} (${exchange.type})`);
    }

    this.logger.log(`Declared ${exchangeEntries.length} exchanges`);
  }

  /**
   * Check if connected to RabbitMQ
   */
  checkHealth(): { status: 'connected' | 'disconnected'; message?: string } {
    if (this.isConnected && this.connection && this.channel) {
      return { status: 'connected' };
    }

    return {
      status: 'disconnected',
      message: 'Not connected to RabbitMQ',
    };
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get the channel for advanced operations
   */
  getChannel(): AmqpChannel | null {
    return this.channel;
  }
}
