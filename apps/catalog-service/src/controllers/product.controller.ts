import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { ProductService } from '../services';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  SearchProductDto,
  FeaturedProductsQueryDto,
  UpdateStockDto,
} from '../dto';

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Get all products with filtering and pagination (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCTS)
  async getProducts(
    @Payload() data: ProductQueryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getAll(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get product by slug (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT)
  async getProduct(
    @Payload() data: { slug: string; lang?: Language },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getBySlug(
        data.slug,
        data.lang || Language.FR,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get featured products (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_FEATURED_PRODUCTS)
  async getFeaturedProducts(
    @Payload() data: FeaturedProductsQueryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getFeatured(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Search products (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.SEARCH_PRODUCTS)
  async searchProducts(
    @Payload() data: SearchProductDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.search(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get stock information (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_STOCK)
  async getStock(
    @Payload() data: { productId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getStock(data.productId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get all products for admin (includes all fields)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCTS_ADMIN)
  async getProductsAdmin(
    @Payload() data: ProductQueryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getAllAdmin(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get product by ID (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_BY_ID)
  async getProductById(
    @Payload() data: { id: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.getById(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Create a new product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CREATE_PRODUCT)
  async createProduct(
    @Payload() data: CreateProductDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.create(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Update an existing product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT)
  async updateProduct(
    @Payload() data: { id: string } & UpdateProductDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { id, ...updateDto } = data;
      const result = await this.productService.update(id, updateDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Update stock for a physical product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.UPDATE_STOCK)
  async updateStock(
    @Payload() data: { id: string } & UpdateStockDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { id, ...stockDto } = data;
      const result = await this.productService.updateStock(id, stockDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Delete a product (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT)
  async deleteProduct(
    @Payload() data: { id: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.delete(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
