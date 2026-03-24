import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, INestMicroservice, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ThrottlerStorage as ThrottlerStorageInterface } from '@nestjs/throttler/dist/throttler-storage.interface';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import * as cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { TransformInterceptor } from '@cyna-api/common';
import { GatewayModule } from '../src/gateway.module';
import { AuthModule } from '../../auth-service/src/auth.module';
import { AuthEventsPublisher } from '../../auth-service/src/events/auth-events.publisher';
import {
  UserRegisteredEventData,
  PasswordResetRequestedEventData,
  Admin2FACodeRequestedEventData,
} from '../../auth-service/src/events/auth-events.publisher';

/**
 * A mock storage that never reports enough hits to trigger throttling.
 */
class NoopThrottlerStorage implements ThrottlerStorageInterface {
  async increment(
    _key: string,
    _ttl: number,
    _limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
  }
}

/**
 * Captured event data from the AuthEventsPublisher spy.
 * In E2E tests, the real NOTIFICATION and PAYMENT services don't exist,
 * so we replace AuthEventsPublisher with this spy that stores emitted data.
 * This lets tests retrieve raw verification tokens and reset tokens.
 */
export interface CapturedEvents {
  userRegistered: UserRegisteredEventData[];
  passwordResetRequested: PasswordResetRequestedEventData[];
  admin2FACodeRequested: Admin2FACodeRequestedEventData[];
  userVerified: string[];
  userLogin: string[];
  adminLogin: string[];
  passwordResetCompleted: string[];
  passwordChanged: Array<{ userId: string; email: string; language: string }>;
  accountDeleted: Array<{ userId: string; stripeCustomerId?: string }>;
}

/**
 * Mock AuthEventsPublisher that captures all emitted events instead of
 * sending them to non-existent NOTIFICATION and PAYMENT services.
 */
export class MockAuthEventsPublisher {
  public readonly events: CapturedEvents = {
    userRegistered: [],
    passwordResetRequested: [],
    admin2FACodeRequested: [],
    userVerified: [],
    userLogin: [],
    adminLogin: [],
    passwordResetCompleted: [],
    passwordChanged: [],
    accountDeleted: [],
  };

  async emitUserRegistered(data: UserRegisteredEventData): Promise<void> {
    this.events.userRegistered.push(data);
  }

  async emitPasswordResetRequested(data: PasswordResetRequestedEventData): Promise<void> {
    this.events.passwordResetRequested.push(data);
  }

  async emitAdmin2FACodeRequested(data: Admin2FACodeRequestedEventData): Promise<void> {
    this.events.admin2FACodeRequested.push(data);
  }

  async emitUserVerified(userId: string): Promise<void> {
    this.events.userVerified.push(userId);
  }

  async emitUserLogin(userId: string): Promise<void> {
    this.events.userLogin.push(userId);
  }

  async emitAdminLogin(adminId: string): Promise<void> {
    this.events.adminLogin.push(adminId);
  }

  async emitPasswordResetCompleted(userId: string): Promise<void> {
    this.events.passwordResetCompleted.push(userId);
  }

  async emitPasswordChanged(userId: string, email: string, language: string): Promise<void> {
    this.events.passwordChanged.push({ userId, email, language });
  }

  async emitAccountDeleted(data: { userId: string; stripeCustomerId?: string }): Promise<void> {
    this.events.accountDeleted.push(data);
  }

  /**
   * Clear all captured events. Call in beforeEach to isolate tests.
   */
  clear(): void {
    this.events.userRegistered = [];
    this.events.passwordResetRequested = [];
    this.events.admin2FACodeRequested = [];
    this.events.userVerified = [];
    this.events.userLogin = [];
    this.events.adminLogin = [];
    this.events.passwordResetCompleted = [];
    this.events.passwordChanged = [];
    this.events.accountDeleted = [];
  }

  /**
   * Get the most recent raw verification token emitted for a given email.
   */
  getVerificationToken(email: string): string | undefined {
    const event = [...this.events.userRegistered].reverse().find((e) => e.email === email);
    return event?.verificationToken;
  }

  /**
   * Get the most recent raw password reset token emitted for a given email.
   */
  getResetToken(email: string): string | undefined {
    const event = [...this.events.passwordResetRequested].reverse().find((e) => e.email === email);
    return event?.resetToken;
  }

  /**
   * Get the most recent 2FA code emitted for a given admin email.
   */
  get2FACode(email: string): string | undefined {
    const event = [...this.events.admin2FACodeRequested].reverse().find((e) => e.email === email);
    return event?.code;
  }
}

let app: INestApplication;
let authMicroservice: INestMicroservice;
let dataSource: DataSource;
let eventsSpy: MockAuthEventsPublisher;

export interface SetupOptions {
  /** When true, keeps the real ThrottlerModule limits. Defaults to false (throttling disabled). */
  enableThrottling?: boolean;
}

export async function setupTestApp(options?: SetupOptions): Promise<{
  app: INestApplication;
  dataSource: DataSource;
  eventsSpy: MockAuthEventsPublisher;
}> {
  const { enableThrottling = false } = options || {};
  const mockEventsPublisher = new MockAuthEventsPublisher();

  // 1. Bootstrap Auth Service microservice
  const authModule: TestingModule = await Test.createTestingModule({
    imports: [AuthModule],
  })
    .overrideProvider(AuthEventsPublisher)
    .useValue(mockEventsPublisher)
    .compile();

  authMicroservice = authModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
      queue: 'auth.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await authMicroservice.listen();

  // 2. Bootstrap API Gateway HTTP app
  const gatewayBuilder = Test.createTestingModule({
    imports: [GatewayModule],
  });

  // Disable throttling for all tests except rate-limiting tests
  // by replacing the storage with a no-op implementation.
  if (!enableThrottling) {
    gatewayBuilder.overrideProvider(ThrottlerStorageInterface).useClass(NoopThrottlerStorage);
  }

  const gatewayModule: TestingModule = await gatewayBuilder.compile();

  app = gatewayModule.createNestApplication();

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();

  // 3. Get DataSource for direct DB access in tests
  dataSource = authModule.get<DataSource>(DataSource);
  eventsSpy = mockEventsPublisher;

  return { app, dataSource, eventsSpy };
}

export async function teardownTestApp(): Promise<void> {
  if (app) await app.close();
  if (authMicroservice) await authMicroservice.close();
}
