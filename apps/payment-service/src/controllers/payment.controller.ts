import { Controller, Logger, HttpException } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, RpcException } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, EVENT_PATTERNS } from '@cyna-api/common';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { LicenseService } from '../services/license.service';
import { LicenseKey } from '../entities/license-key.entity';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import { SubscriptionStatus } from '@cyna-api/common';

@Controller()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly licenseService: LicenseService,
  ) {}

  private wrapError(error: unknown): RpcException {
    if (error instanceof RpcException) return error;
    // Preserve HttpException status (e.g. NotFoundException → 404) so the
    // gateway can propagate the correct HTTP status instead of a blanket 500.
    if (error instanceof HttpException) {
      return new RpcException({
        statusCode: error.getStatus(),
        message: error.message,
        code: 'PAYMENT_SERVICE_ERROR',
      });
    }
    const message = error instanceof Error ? error.message : 'Unknown payment service error';
    this.logger.error(
      `Unhandled error: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );
    return new RpcException({
      statusCode: 500,
      message,
      code: 'PAYMENT_SERVICE_ERROR',
    });
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CREATE_PAYMENT_INTENT)
  async createPaymentIntent(@Payload() dto: CreatePaymentIntentDto) {
    try {
      return await this.paymentService.createPaymentIntent(dto);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.RETRIEVE_PAYMENT_INTENT)
  async retrievePaymentIntent(@Payload() dto: { paymentIntentId: string }) {
    try {
      return await this.paymentService.retrievePaymentIntent(dto.paymentIntentId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CREATE_SUBSCRIPTION)
  async createSubscription(@Payload() dto: CreateSubscriptionDto) {
    try {
      return await this.paymentService.createSubscription(dto);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS)
  async getSubscriptions(
    @Payload()
    data: {
      userId?: string;
      adminMode?: boolean;
      status?: SubscriptionStatus;
      page?: number;
      limit?: number;
    },
  ) {
    try {
      return await this.paymentService.getSubscriptionsForUser(data.userId, {
        adminMode: data.adminMode === true,
        status: data.status,
        page: data.page,
        limit: data.limit,
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION)
  async cancelSubscription(@Payload() dto: CancelSubscriptionDto) {
    try {
      return await this.subscriptionService.cancel(
        dto.subscriptionId,
        dto.actor,
        dto.userId,
        dto.cancelAtPeriodEnd ?? true,
      );
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION)
  async getSubscription(@Payload() data: { subscriptionId: string }) {
    try {
      return await this.subscriptionService.findById(data.subscriptionId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES)
  async getUserLicenses(@Payload() data: { userId: string }): Promise<LicenseKey[]> {
    try {
      return await this.licenseService.findByUserId(data.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_LICENSE_BY_ID)
  async getLicenseById(
    @Payload() data: { licenseId: string; userId: string },
  ): Promise<LicenseKey> {
    try {
      return await this.licenseService.findByIdForUser(data.licenseId, data.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.ACTIVATE_LICENSE)
  async activateLicense(@Payload() data: { token: string }): Promise<LicenseKey> {
    try {
      return await this.licenseService.activate(data.token);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.ADMIN_UPDATE_SUBSCRIPTION_TERMS)
  async adminUpdateSubscriptionTerms(
    @Payload()
    data: {
      subscriptionId: string;
      cancelAtPeriodEnd?: boolean;
      trialEnd?: 'now' | number;
    },
  ) {
    try {
      return await this.subscriptionService.adminUpdateTerms(data.subscriptionId, {
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        trialEnd: data.trialEnd,
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Handle account deletion event - cancel all active Stripe subscriptions
   * and revoke all active license keys for the deleted user
   */
  @EventPattern(EVENT_PATTERNS.AUTH.ACCOUNT_DELETED)
  async handleAccountDeleted(
    @Payload() data: { userId: string; stripeCustomerId?: string },
  ): Promise<void> {
    this.logger.log(
      `Processing account_deleted event for user: ${data.userId}`,
      'PaymentController',
    );

    // Subscription cancellation and license revocation are handled in
    // isolated try/catch blocks so a failure in one does not silently
    // prevent the other. Distinctive log tags (SUBSCRIPTION_CANCELLATION_FAILED /
    // LICENSE_REVOCATION_FAILED) let alerting pick these up — critical for RGPD
    // (failure to revoke licenses on account deletion must be noticed).
    try {
      if (data.stripeCustomerId) {
        const cancelledCount = await this.subscriptionService.cancelAllForCustomer(
          data.stripeCustomerId,
        );
        this.logger.log(
          `Cancelled ${cancelledCount} subscriptions for customer ${data.stripeCustomerId}`,
          'PaymentController',
        );
      } else {
        this.logger.log(
          `No Stripe customer ID for user ${data.userId}, skipping subscription cancellation`,
          'PaymentController',
        );
      }
    } catch (error) {
      this.logger.error(
        `SUBSCRIPTION_CANCELLATION_FAILED userId=${data.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'PaymentController',
      );
    }

    try {
      const revokedCount = await this.licenseService.revokeAllForUser(data.userId);
      this.logger.log(
        `Revoked ${revokedCount} licenses for user ${data.userId}`,
        'PaymentController',
      );
    } catch (error) {
      this.logger.error(
        `LICENSE_REVOCATION_FAILED userId=${data.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'PaymentController',
      );
    }
  }
}
