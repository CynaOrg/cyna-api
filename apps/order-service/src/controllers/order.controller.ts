import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { CartService } from '../services';
import { AddCartItemDto, UpdateCartItemDto } from '../dto';

@Controller()
export class OrderController {
  constructor(private readonly cartService: CartService) {}

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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
    }
  }
}
