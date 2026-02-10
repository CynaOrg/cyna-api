import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { CartService } from '../services';
import { AddCartItemDto, UpdateCartItemDto, MergeCartDto } from '../dto';

@Controller()
export class OrderController {
  constructor(private readonly cartService: CartService) {}

  @MessagePattern(MESSAGE_PATTERNS.ORDER.GET_CART)
  async getCart(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.getCart(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM)
  async addCartItem(
    @Payload() data: { userId: string; dto: AddCartItemDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.addItem(data.userId, data.dto);
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
      userId: string;
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
        data.userId,
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
    @Payload() data: { userId: string; productId: string; billingPeriod?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.removeItem(
        data.userId,
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
  async clearCart(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.clearCart(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ORDER.MERGE_CART)
  async mergeCart(
    @Payload() data: { userId: string; dto: MergeCartDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.cartService.mergeCart(data.userId, data.dto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
