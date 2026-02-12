import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CynaConfigModule, LoggerModule, CynaI18nModule, RabbitMQModule } from '@cyna-api/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { WebhookModule } from './webhooks/webhook.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrderModule } from './orders/order.module';
import { SubscriptionModule } from './subscriptions/subscription.module';
import { UserModule } from './users/user.module';
import { AnalyticsModule } from './analytics/analytics.module';

/**
 * Gateway Module
 * Root module for the API Gateway application
 */
@Module({
  imports: [
    // Core modules from @cyna-api/common
    CynaConfigModule,
    LoggerModule,
    CynaI18nModule,
    RabbitMQModule.forRoot({ registerClients: true }),

    // Rate limiting - global configuration
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute (global)
      },
    ]),

    // Feature modules
    HealthModule,
    AuthModule,
    CatalogModule,
    CartModule,
    WebhookModule,
    CheckoutModule,
    OrderModule,
    SubscriptionModule,
    UserModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class GatewayModule {}
