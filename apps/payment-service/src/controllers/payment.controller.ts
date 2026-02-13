import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, Ctx, RmqContext, RpcException } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, EVENT_PATTERNS } from '@cyna-api/common';
import { PaymentService } from '../services/payment.service';
import { SubscriptionService } from '../services/subscription.service';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';

@Controller()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  private wrapError(error: unknown): RpcException {
    if (error instanceof RpcException) return error;
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
  async createPaymentIntent(@Payload() dto: CreatePaymentIntentDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.paymentService.createPaymentIntent(dto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CREATE_SUBSCRIPTION)
  async createSubscription(@Payload() dto: CreateSubscriptionDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.paymentService.createSubscription(dto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS)
  async getSubscriptions(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.paymentService.getSubscriptionsForUser(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION)
  async cancelSubscription(@Payload() dto: CancelSubscriptionDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.subscriptionService.cancel(
        dto.subscriptionId,
        dto.userId,
        dto.cancelAtPeriodEnd ?? true,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION)
  async getSubscription(@Payload() data: { subscriptionId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.subscriptionService.findById(data.subscriptionId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  /**
   * Handle account deletion event - cancel all active Stripe subscriptions
   */
  @EventPattern(EVENT_PATTERNS.AUTH.ACCOUNT_DELETED)
  async handleAccountDeleted(
    @Payload() data: { userId: string; stripeCustomerId?: string },
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    this.logger.log(
      `Processing account_deleted event for user: ${data.userId}`,
      'PaymentController',
    );

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
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Failed to handle account_deleted event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'PaymentController',
      );
      // Requeue the message for retry
      channel.nack(originalMsg, false, true);
    }
  }
}
