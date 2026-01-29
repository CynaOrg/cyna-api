import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { StockReservationService } from '../services';
import {
  ReserveStockDto,
  ConfirmStockDto,
  ReleaseStockDto,
} from '../dto';

@Controller()
export class StockReservationController {
  constructor(
    private readonly stockReservationService: StockReservationService,
  ) {}

  /**
   * Reserve stock for cart items during checkout
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.RESERVE_STOCK)
  async reserveStock(
    @Payload() data: ReserveStockDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockReservationService.reserveStock(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Release stock reservations (cart abandoned, checkout failed, etc.)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.RELEASE_STOCK)
  async releaseStock(
    @Payload() data: ReleaseStockDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockReservationService.releaseStock(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Confirm stock reservations (payment successful)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CONFIRM_STOCK)
  async confirmStock(
    @Payload() data: ConfirmStockDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockReservationService.confirmStock(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get active reservations (admin endpoint)
   */
  @MessagePattern({ cmd: 'catalog.admin.get_reservations' })
  async getReservations(
    @Payload() data: { productId?: string; userId?: string; cartId?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockReservationService.getActiveReservations(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
