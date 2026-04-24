import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, INestMicroservice, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport, ClientProxy } from '@nestjs/microservices';
import { ThrottlerStorage as ThrottlerStorageInterface } from '@nestjs/throttler/dist/throttler-storage.interface';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import * as cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { of } from 'rxjs';
import Stripe from 'stripe';
import { TransformInterceptor, SERVICE_NAMES } from '@cyna-api/common';
import { S3Service } from '@cyna-api/s3';
import { GatewayModule } from '../src/gateway.module';
import { AuthModule } from '../../auth-service/src/auth.module';
import { UserModule } from '../../user-service/src/user.module';
import { AuthEventsPublisher } from '../../auth-service/src/events/auth-events.publisher';
import {
  UserRegisteredEventData,
  PasswordResetRequestedEventData,
  Admin2FACodeRequestedEventData,
} from '../../auth-service/src/events/auth-events.publisher';
import { CatalogModule } from '../../catalog-service/src/catalog.module';
import { CatalogEventsPublisher } from '../../catalog-service/src/events';
import { OrderModule } from '../../order-service/src/order.module';
import { PaymentModule } from '../../payment-service/src/payment.module';
import { StripeService } from '../../payment-service/src/services/stripe.service';

// ---------------------------------------------------------------------------
// Mock ClientProxy – absorbs send() / emit() without connecting to RabbitMQ
// ---------------------------------------------------------------------------

class MockClientProxy {
  emit(): ReturnType<ClientProxy['emit']> {
    return of(undefined);
  }

  send(): ReturnType<ClientProxy['send']> {
    return of(undefined);
  }

  async connect(): Promise<void> {
    /* noop */
  }

  async close(): Promise<void> {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Mock S3Service – no real S3/R2 calls in E2E tests
// ---------------------------------------------------------------------------

class MockS3Service {
  async generatePresignedPutUrl(
    _key: string,
    _contentType: string,
    _expiresIn?: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    return { url: 'https://mock-s3.test/presigned', expiresAt: new Date(Date.now() + 900_000) };
  }

  async deleteObject(_key: string): Promise<void> {
    /* noop */
  }

  getPublicUrl(key: string): string {
    return `https://mock-s3.test/${key}`;
  }
}

// ---------------------------------------------------------------------------
// Mock CatalogEventsPublisher – captures catalog events without RabbitMQ
// ---------------------------------------------------------------------------

class MockCatalogEventsPublisher {
  async emitProductCreated(): Promise<void> {
    /* noop */
  }
  async emitProductUpdated(): Promise<void> {
    /* noop */
  }
  async emitProductDeleted(): Promise<void> {
    /* noop */
  }
  async emitStockReserved(): Promise<void> {
    /* noop */
  }
  async emitStockReleased(): Promise<void> {
    /* noop */
  }
  async emitStockConfirmed(): Promise<void> {
    /* noop */
  }
  async emitStockLow(): Promise<void> {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Mock StripeService – no real Stripe API calls in E2E tests
// ---------------------------------------------------------------------------

export class MockStripeService {
  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    return {
      id: `pi_mock_${Date.now()}`,
      object: 'payment_intent',
      amount,
      currency,
      metadata,
      status: 'requires_payment_method',
      client_secret: `pi_mock_${Date.now()}_secret_test`,
      payment_method_types: ['card'],
    } as unknown as Stripe.PaymentIntent;
  }

  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Customer> {
    return {
      id: `cus_mock_${Date.now()}`,
      object: 'customer',
      email,
      name,
      metadata: metadata || {},
    } as unknown as Stripe.Customer;
  }

  async createSubscription(
    customerId: string,
    priceId: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    return {
      id: `sub_mock_${Date.now()}`,
      object: 'subscription',
      customer: customerId,
      items: { data: [{ price: { id: priceId } }] },
      status: 'incomplete',
      metadata,
      latest_invoice: {
        confirmation_secret: { client_secret: `seti_mock_secret_${Date.now()}` },
      },
    } as unknown as Stripe.Subscription;
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<Stripe.Subscription> {
    return {
      id: subscriptionId,
      object: 'subscription',
      status: cancelAtPeriodEnd ? 'active' : 'canceled',
      cancel_at_period_end: cancelAtPeriodEnd,
    } as unknown as Stripe.Subscription;
  }

  async updateSubscription(
    subscriptionId: string,
    _params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return {
      id: subscriptionId,
      object: 'subscription',
      status: 'active',
    } as unknown as Stripe.Subscription;
  }

  constructWebhookEvent(_rawBody: Buffer, _signature: string, _secret: string): Stripe.Event {
    return {
      id: `evt_mock_${Date.now()}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: {} },
    } as unknown as Stripe.Event;
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return {
      id: subscriptionId,
      object: 'subscription',
      status: 'active',
    } as unknown as Stripe.Subscription;
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return {
      id: invoiceId,
      object: 'invoice',
      status: 'paid',
    } as unknown as Stripe.Invoice;
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return {
      id: paymentIntentId,
      object: 'payment_intent',
      status: 'succeeded',
    } as unknown as Stripe.PaymentIntent;
  }

  async listActiveSubscriptions(_customerId: string): Promise<Stripe.Subscription[]> {
    return [];
  }
}

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
let userMicroservice: INestMicroservice;
let catalogMicroservice: INestMicroservice;
let orderMicroservice: INestMicroservice;
let paymentMicroservice: INestMicroservice;
let dataSource: DataSource;
let userDataSource: DataSource;
let catalogDataSource: DataSource;
let orderDataSource: DataSource;
let paymentDataSource: DataSource;
let eventsSpy: MockAuthEventsPublisher;

export interface SetupOptions {
  /** When true, keeps the real ThrottlerModule limits. Defaults to false (throttling disabled). */
  enableThrottling?: boolean;
  /**
   * When true, does NOT override SERVICE_NAMES.ORDER in payment-service with MockClientProxy,
   * so payment-service communicates with the real order-service microservice over RabbitMQ.
   * Required for tests that exercise the webhook → RPC → license generation flow.
   * Defaults to false.
   */
  useRealOrderClientInPayment?: boolean;
}

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export async function setupTestApp(options?: SetupOptions): Promise<{
  app: INestApplication;
  dataSource: DataSource;
  userDataSource: DataSource;
  catalogDataSource: DataSource;
  orderDataSource: DataSource;
  paymentDataSource: DataSource;
  paymentModule: TestingModule;
  orderModule: TestingModule;
  eventsSpy: MockAuthEventsPublisher;
}> {
  const { enableThrottling = false, useRealOrderClientInPayment = false } = options || {};
  const mockEventsPublisher = new MockAuthEventsPublisher();
  const mockClientProxy = new MockClientProxy();

  // -----------------------------------------------------------------------
  // 1. Bootstrap User Service microservice (must start before auth-service
  //    because auth-service registers an RMQ ClientProxy pointing to user.queue)
  // -----------------------------------------------------------------------
  const userModule: TestingModule = await Test.createTestingModule({
    imports: [UserModule],
  })
    .overrideProvider(SERVICE_NAMES.NOTIFICATION)
    .useValue(mockClientProxy)
    .overrideProvider(SERVICE_NAMES.AUTH)
    .useValue(mockClientProxy)
    .compile();

  userMicroservice = userModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'user.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await userMicroservice.listen();

  // -----------------------------------------------------------------------
  // 2. Bootstrap Auth Service microservice
  // -----------------------------------------------------------------------
  const authModule: TestingModule = await Test.createTestingModule({
    imports: [AuthModule],
  })
    .overrideProvider(AuthEventsPublisher)
    .useValue(mockEventsPublisher)
    .compile();

  authMicroservice = authModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'auth.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await authMicroservice.listen();

  // -----------------------------------------------------------------------
  // 2. Bootstrap Catalog Service microservice
  // -----------------------------------------------------------------------
  const catalogModule: TestingModule = await Test.createTestingModule({
    imports: [CatalogModule],
  })
    .overrideProvider(CatalogEventsPublisher)
    .useValue(new MockCatalogEventsPublisher())
    .overrideProvider(S3Service)
    .useValue(new MockS3Service())
    .overrideProvider(SERVICE_NAMES.NOTIFICATION)
    .useValue(mockClientProxy)
    .overrideProvider(SERVICE_NAMES.ANALYTICS)
    .useValue(mockClientProxy)
    .compile();

  catalogMicroservice = catalogModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'catalog.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await catalogMicroservice.listen();

  // -----------------------------------------------------------------------
  // 3. Bootstrap Order Service microservice
  // -----------------------------------------------------------------------
  const orderModule: TestingModule = await Test.createTestingModule({
    imports: [OrderModule],
  }).compile();

  orderMicroservice = orderModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'order.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await orderMicroservice.listen();

  // -----------------------------------------------------------------------
  // 4. Bootstrap Payment Service microservice
  // -----------------------------------------------------------------------
  const paymentModuleBuilder = Test.createTestingModule({
    imports: [PaymentModule],
  })
    .overrideProvider(StripeService)
    .useValue(new MockStripeService())
    .overrideProvider(SERVICE_NAMES.NOTIFICATION)
    .useValue(mockClientProxy);

  if (!useRealOrderClientInPayment) {
    paymentModuleBuilder.overrideProvider(SERVICE_NAMES.ORDER).useValue(mockClientProxy);
  }

  const paymentModule: TestingModule = await paymentModuleBuilder.compile();

  paymentMicroservice = paymentModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: 'payment.queue',
      queueOptions: { durable: true },
      noAck: true,
      prefetchCount: 10,
    },
  });

  await paymentMicroservice.listen();

  // -----------------------------------------------------------------------
  // 5. Bootstrap API Gateway HTTP app
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // 6. Get DataSources for direct DB access in tests
  // -----------------------------------------------------------------------
  dataSource = authModule.get<DataSource>(DataSource);
  userDataSource = userModule.get<DataSource>(DataSource);
  catalogDataSource = catalogModule.get<DataSource>(DataSource);
  orderDataSource = orderModule.get<DataSource>(DataSource);
  paymentDataSource = paymentModule.get<DataSource>(DataSource);
  eventsSpy = mockEventsPublisher;

  return {
    app,
    dataSource,
    userDataSource,
    catalogDataSource,
    orderDataSource,
    paymentDataSource,
    paymentModule,
    orderModule,
    eventsSpy,
  };
}

export async function teardownTestApp(): Promise<void> {
  if (app) await app.close();
  if (paymentMicroservice) await paymentMicroservice.close();
  if (orderMicroservice) await orderMicroservice.close();
  if (catalogMicroservice) await catalogMicroservice.close();
  if (authMicroservice) await authMicroservice.close();
  if (userMicroservice) await userMicroservice.close();
}
