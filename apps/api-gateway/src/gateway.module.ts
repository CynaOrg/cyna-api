import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CynaConfigModule, LoggerModule, CynaI18nModule, RabbitMQModule } from '@cyna-api/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { WebhookModule } from './webhooks/webhook.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrderModule } from './orders/order.module';
import { SubscriptionModule } from './subscriptions/subscription.module';
import { LicenseModule } from './licenses/license.module';
import { UserModule } from './users/user.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ContentModule } from './content/content.module';

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
    ProfileModule,
    CatalogModule,
    CartModule,
    WebhookModule,
    CheckoutModule,
    OrderModule,
    SubscriptionModule,
    LicenseModule,
    UserModule,
    ContentModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JwtAuthGuard registered as a global APP_GUARD so new endpoints are
    // authenticated by default. Public routes must be marked with @Public().
    // ThrottlerGuard runs first because it does not depend on auth state.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class GatewayModule {}
