import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

/**
 * Database Module Options for microservices
 */
export interface DatabaseMicroserviceOptions {
  /**
   * Array of entity classes or schemas to register
   */
  entities: EntityClassOrSchema[];
}

/**
 * Database Module
 * Provides TypeORM configuration for PostgreSQL
 * Supports both root configuration and microservice-specific setup
 */
@Global()
@Module({})
export class DatabaseModule {
  /**
   * Configure the root database module for the main application
   * Used when the application needs direct database access
   */
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
            type: 'postgres',
            host: configService.get<string>('database.host'),
            port: configService.get<number>('database.port'),
            username: configService.get<string>('database.username'),
            password: configService.get<string>('database.password'),
            database: configService.get<string>('database.database'),
            autoLoadEntities: true,
            synchronize: configService.get<boolean>('database.synchronize'),
            logging: configService.get<boolean>('database.logging'),
            // Connection pool settings for production
            extra: {
              max: 20, // Maximum number of connections in the pool
              idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
              connectionTimeoutMillis: 5000, // Timeout when acquiring a connection
            },
          }),
          inject: [ConfigService],
        }),
      ],
      exports: [TypeOrmModule],
    };
  }

  /**
   * Configure the database module for a specific microservice
   * Registers the provided entities with TypeORM
   *
   * @param options - Configuration options including entities
   */
  static forMicroservice(options: DatabaseMicroserviceOptions): DynamicModule {
    const { entities } = options;

    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
            type: 'postgres',
            host: configService.get<string>('database.host'),
            port: configService.get<number>('database.port'),
            username: configService.get<string>('database.username'),
            password: configService.get<string>('database.password'),
            database: configService.get<string>('database.database'),
            entities,
            synchronize: configService.get<boolean>('database.synchronize'),
            logging: configService.get<boolean>('database.logging'),
            // Connection pool settings for production
            extra: {
              max: 10, // Smaller pool for microservices
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 5000,
            },
          }),
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature(entities),
      ],
      exports: [TypeOrmModule],
    };
  }

  /**
   * Register specific entities for feature modules
   * Use this when you need to inject repositories in a specific module
   *
   * @param entities - Array of entity classes to register
   */
  static forFeature(entities: EntityClassOrSchema[]): DynamicModule {
    return TypeOrmModule.forFeature(entities);
  }
}
