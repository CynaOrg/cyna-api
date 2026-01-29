import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { ProductImageService } from '../services';
import {
  CreateProductImageDto,
  UpdateProductImageDto,
  ReorderImagesDto,
  SetPrimaryImageDto,
} from '../dto';

@Controller()
export class ProductImageController {
  constructor(private readonly imageService: ProductImageService) {}

  /**
   * Get all images for a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_IMAGES)
  async getProductImages(
    @Payload() data: { productId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.imageService.getByProductIdAdmin(data.productId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Add an image to a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.ADD_PRODUCT_IMAGE)
  async addProductImage(
    @Payload() data: { productId: string } & CreateProductImageDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { productId, ...imageDto } = data;
      const result = await this.imageService.create(productId, imageDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Update an image (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT_IMAGE)
  async updateProductImage(
    @Payload() data: { imageId: string } & UpdateProductImageDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { imageId, ...updateDto } = data;
      const result = await this.imageService.update(imageId, updateDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Delete an image (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT_IMAGE)
  async deleteProductImage(
    @Payload() data: { imageId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.imageService.delete(data.imageId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Set an image as primary (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.SET_PRIMARY_IMAGE)
  async setPrimaryImage(
    @Payload() data: { productId: string; imageId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.imageService.setPrimary(data.productId, data.imageId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Reorder images for a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.REORDER_IMAGES)
  async reorderImages(
    @Payload() data: { productId: string } & ReorderImagesDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { productId, ...reorderDto } = data;
      const result = await this.imageService.reorder(productId, reorderDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
