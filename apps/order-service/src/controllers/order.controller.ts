import { Controller, Logger } from '@nestjs/common';
import {
  MessagePattern,
  EventPattern,
  Payload,
  Ctx,
  RmqContext,
  RpcException,
} from '@nestjs/microservices';
import { MESSAGE_PATTERNS, EVENT_PATTERNS } from '@cyna-api/common';
import { CartService, OrderService } from '../services';
import { AddCartItemDto, UpdateCartItemDto } from '../dto';

@Controller()
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
  ) {}

  private wrapError(error: unknown): RpcException {
    if (error instanceof RpcException) return error;
    const message = error instanceof Error ? error.message : 'Unknown order service error';
    this.logger.error(
      `Unhandled error: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );
    return new RpcException({
      statusCode: 500,
      message,
      code: 'ORDER_SERVICE_ERROR',
    });
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_CART)
  async getCart(
    @Payload() data: { userId?: string; sessionId?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.getCart({
        userId: data.userId,
        sessionId: data.sessionId,
      });
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM)
  async addCartItem(
    @Payload() data: { userId?: string; sessionId?: string; dto: AddCartItemDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.addItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.dto,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.UPDATE_CART_ITEM)
  async updateCartItem(
    @Payload()
    data: {
      userId?: string;
      sessionId?: string;
      productId: string;
      dto: UpdateCartItemDto;
      billingPeriod?: string;
    },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.updateItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.productId,
        data.dto,
        data.billingPeriod as any,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM)
  async removeCartItem(
    @Payload()
    data: { userId?: string; sessionId?: string; productId: string; billingPeriod?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.removeItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.productId,
        data.billingPeriod as any,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.CLEAR_CART)
  async clearCart(
    @Payload() data: { userId?: string; sessionId?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.clearCart({
        userId: data.userId,
        sessionId: data.sessionId,
      });
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART)
  async mergeGuestCart(
    @Payload() data: { userId: string; sessionId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.mergeGuestCart(data.userId, data.sessionId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  // ---- Order handlers ----

  @MessagePattern(MESSAGE_PATTERNS.ORDER.CREATE_ORDER)
  async createOrder(
    @Payload()
    data: {
      userId?: string;
      cartId: string;
      billingAddress: Record<string, any>;
      shippingAddress?: Record<string, any>;
      email: string;
      stripePaymentIntentId: string;
    },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.createOrderFromCart(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDERS)
  async getOrders(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.getOrdersByUserId(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDER)
  async getOrder(
    @Payload() data: { orderId: string; userId?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.getOrderById(data.orderId, data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT)
  async getOrderByPaymentIntent(
    @Payload() data: { paymentIntentId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.getOrderByPaymentIntentId(data.paymentIntentId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.CONFIRMED)
  async onPaymentConfirmed(
    @Payload() data: { paymentIntentId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.orderService.handlePaymentConfirmed(data.paymentIntentId);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to handle payment confirmed: ${error}`);
      channel.ack(originalMsg);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.FAILED)
  async onPaymentFailed(@Payload() data: { paymentIntentId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.orderService.handlePaymentFailed(data.paymentIntentId);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to handle payment failed: ${error}`);
      channel.ack(originalMsg);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.REFUNDED)
  async onPaymentRefunded(
    @Payload() data: { paymentIntentId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.orderService.handlePaymentRefunded(data.paymentIntentId);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to handle payment refunded: ${error}`);
      channel.ack(originalMsg);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS)
  async adminGetOrders(
    @Payload()
    data: { search?: string; status?: string; page?: number; limit?: number },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.adminGetOrders(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADMIN_UPDATE_STATUS)
  async adminUpdateStatus(
    @Payload() data: { orderId: string; status: string; notes?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.orderService.adminUpdateOrderStatus(
        data.orderId,
        data.status,
        data.notes,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw this.wrapError(error);
    }
  }

  @EventPattern(MESSAGE_PATTERNS.ORDER.UPDATE_ORDER_STATUS.cmd)
  async onUpdateOrderStatus(
    @Payload() data: { orderId: string; stripePaymentIntentId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.orderService.updateStripePaymentIntentId(data.orderId, data.stripePaymentIntentId);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to update order payment intent: ${error}`);
      channel.ack(originalMsg);
    }
  }
}
