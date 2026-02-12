import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
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
  async createPaymentIntent(@Payload() dto: CreatePaymentIntentDto) {
    try {
      return await this.paymentService.createPaymentIntent(dto);
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
  async getSubscriptions(@Payload() data: { userId: string }) {
    try {
      return await this.paymentService.getSubscriptionsForUser(data.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION)
  async cancelSubscription(@Payload() dto: CancelSubscriptionDto) {
    try {
      return await this.subscriptionService.cancel(
        dto.subscriptionId,
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
}
