import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { ProductCharacteristicService } from '../services';
import {
  CreateProductCharacteristicDto,
  UpdateProductCharacteristicDto,
  BulkCharacteristicsDto,
  ReorderCharacteristicsDto,
} from '../dto';

@Controller()
export class ProductCharacteristicController {
  constructor(
    private readonly characteristicService: ProductCharacteristicService,
  ) {}

  /**
   * Get all characteristics for a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_CHARACTERISTICS)
  async getProductCharacteristics(
    @Payload() data: { productId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.characteristicService.getByProductIdAdmin(
        data.productId,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Add a characteristic to a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.ADD_PRODUCT_CHARACTERISTIC)
  async addProductCharacteristic(
    @Payload() data: { productId: string } & CreateProductCharacteristicDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { productId, ...charDto } = data;
      const result = await this.characteristicService.create(productId, charDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Update a characteristic (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT_CHARACTERISTIC)
  async updateProductCharacteristic(
    @Payload() data: { characteristicId: string } & UpdateProductCharacteristicDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { characteristicId, ...updateDto } = data;
      const result = await this.characteristicService.update(
        characteristicId,
        updateDto,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Delete a characteristic (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT_CHARACTERISTIC)
  async deleteProductCharacteristic(
    @Payload() data: { characteristicId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.characteristicService.delete(data.characteristicId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Bulk create/update characteristics for a product (admin endpoint)
   * This replaces all existing characteristics
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.BULK_UPSERT_CHARACTERISTICS)
  async bulkUpsertCharacteristics(
    @Payload() data: { productId: string } & BulkCharacteristicsDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { productId, ...bulkDto } = data;
      const result = await this.characteristicService.bulkUpsert(productId, bulkDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Reorder characteristics for a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.REORDER_CHARACTERISTICS)
  async reorderCharacteristics(
    @Payload() data: { productId: string } & ReorderCharacteristicsDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { productId, ...reorderDto } = data;
      const result = await this.characteristicService.reorder(productId, reorderDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
