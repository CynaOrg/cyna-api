import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, RpcException } from '@nestjs/microservices';
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
  async getCart(@Payload() data: { userId?: string; sessionId?: string }) {
    try {
      return await this.cartService.getCart({
        userId: data.userId,
        sessionId: data.sessionId,
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM)
  async addCartItem(@Payload() data: { userId?: string; sessionId?: string; dto: AddCartItemDto }) {
    try {
      return await this.cartService.addItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.dto,
      );
    } catch (error) {
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
  ) {
    try {
      return await this.cartService.updateItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.productId,
        data.dto,
        data.billingPeriod as any,
      );
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM)
  async removeCartItem(
    @Payload()
    data: {
      userId?: string;
      sessionId?: string;
      productId: string;
      billingPeriod?: string;
    },
  ) {
    try {
      return await this.cartService.removeItem(
        { userId: data.userId, sessionId: data.sessionId },
        data.productId,
        data.billingPeriod as any,
      );
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.CLEAR_CART)
  async clearCart(@Payload() data: { userId?: string; sessionId?: string }) {
    try {
      return await this.cartService.clearCart({
        userId: data.userId,
        sessionId: data.sessionId,
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART)
  async mergeGuestCart(@Payload() data: { userId: string; sessionId: string }) {
    try {
      return await this.cartService.mergeGuestCart(data.userId, data.sessionId);
    } catch (error) {
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
  ) {
    try {
      return await this.orderService.createOrderFromCart(data);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDERS)
  async getOrders(@Payload() data: { userId: string }) {
    try {
      return await this.orderService.getOrdersByUserId(data.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDER)
  async getOrder(@Payload() data: { orderId: string; userId?: string }) {
    try {
      return await this.orderService.getOrderById(data.orderId, data.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT)
  async getOrderByPaymentIntent(@Payload() data: { paymentIntentId: string }) {
    try {
      return await this.orderService.getOrderByPaymentIntentId(data.paymentIntentId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.CONFIRMED)
  async onPaymentConfirmed(@Payload() data: { paymentIntentId: string }) {
    try {
      await this.orderService.handlePaymentConfirmed(data.paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to handle payment confirmed: ${error}`);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.FAILED)
  async onPaymentFailed(@Payload() data: { paymentIntentId: string }) {
    try {
      await this.orderService.handlePaymentFailed(data.paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to handle payment failed: ${error}`);
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.REFUNDED)
  async onPaymentRefunded(@Payload() data: { paymentIntentId: string }) {
    try {
      await this.orderService.handlePaymentRefunded(data.paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to handle payment refunded: ${error}`);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS)
  async adminGetOrders(
    @Payload()
    data: {
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    try {
      return await this.orderService.adminGetOrders(data);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADMIN_UPDATE_STATUS)
  async adminUpdateStatus(@Payload() data: { orderId: string; status: string; notes?: string }) {
    try {
      return await this.orderService.adminUpdateOrderStatus(data.orderId, data.status, data.notes);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  @EventPattern(MESSAGE_PATTERNS.ORDER.UPDATE_ORDER_STATUS.cmd)
  async onUpdateOrderStatus(@Payload() data: { orderId: string; stripePaymentIntentId: string }) {
    try {
      await this.orderService.updateStripePaymentIntentId(data.orderId, data.stripePaymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to update order payment intent: ${error}`);
    }
  }
}
