import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { CategoryService, ProductService, StockService } from '../services';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
  CategoryResponseDto,
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductListResponseDto,
  ProductDetailResponseDto,
  PaginatedProductResponseDto,
  UpdateStockDto,
  ReserveStockDto,
} from '../dto';

@Controller()
export class CatalogController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
    private readonly stockService: StockService,
  ) {}

  // ==================== Categories ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_CREATE)
  async createCategory(@Payload() data: CreateCategoryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const category = await this.categoryService.create(data);
      const result = CategoryResponseDto.fromEntity(category);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_UPDATE)
  async updateCategory(
    @Payload() data: { id: string; dto: UpdateCategoryDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const category = await this.categoryService.update(data.id, data.dto);
      const result = CategoryResponseDto.fromEntity(category);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_DELETE)
  async deleteCategory(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.categoryService.delete(data.id);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL)
  async findAllCategories(@Payload() data: CategoryQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const categories = await this.categoryService.findAll(data);
      const lang = data.lang ?? Language.FR;
      const result = CategoryResponseDto.fromEntities(categories, lang);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_SLUG)
  async findCategoryBySlug(
    @Payload() data: { slug: string; lang?: Language },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const category = await this.categoryService.findBySlug(data.slug);
      const result = CategoryResponseDto.fromEntity(category, data.lang ?? Language.FR);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_ID)
  async findCategoryById(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.findById(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Products ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_CREATE)
  async createProduct(@Payload() data: CreateProductDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const product = await this.productService.create(data);
      const result = ProductDetailResponseDto.fromEntity(product);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_UPDATE)
  async updateProduct(
    @Payload() data: { id: string; dto: UpdateProductDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const product = await this.productService.update(data.id, data.dto);
      const result = ProductDetailResponseDto.fromEntity(product);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE)
  async deleteProduct(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.productService.delete(data.id);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL)
  async findAllProducts(@Payload() data: ProductQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { data: products, meta } = await this.productService.findAll(data);
      const lang = data.lang ?? Language.FR;
      const result = PaginatedProductResponseDto.create(
        products,
        meta.total,
        meta.page,
        meta.limit,
        lang,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG)
  async findProductBySlug(
    @Payload() data: { slug: string; lang?: Language },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const product = await this.productService.findBySlug(data.slug);
      const result = ProductDetailResponseDto.fromEntity(product, data.lang ?? Language.FR);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID)
  async findProductById(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.findById(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH)
  async searchProducts(
    @Payload() data: { searchTerm: string; query: ProductQueryDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { data: products, meta } = await this.productService.search(
        data.searchTerm,
        data.query,
      );
      const lang = data.query.lang ?? Language.FR;
      const result = PaginatedProductResponseDto.create(
        products,
        meta.total,
        meta.page,
        meta.limit,
        lang,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_FEATURED)
  async findFeaturedProducts(
    @Payload() data: { limit?: number; lang?: Language },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const products = await this.productService.findFeatured(data.limit ?? 10);
      const result = ProductListResponseDto.fromEntities(products, data.lang ?? Language.FR);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_CATEGORY)
  async findProductsByCategory(
    @Payload() data: { categoryId: string; query: ProductQueryDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { data: products, meta } = await this.productService.findByCategory(
        data.categoryId,
        data.query,
      );
      const lang = data.query.lang ?? Language.FR;
      const result = PaginatedProductResponseDto.create(
        products,
        meta.total,
        meta.page,
        meta.limit,
        lang,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Product Images ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_ADD_IMAGE)
  async addProductImage(
    @Payload()
    data: {
      productId: string;
      imageUrl: string;
      altTextFr?: string;
      altTextEn?: string;
      isPrimary?: boolean;
    },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.addImage(
        data.productId,
        data.imageUrl,
        data.altTextFr,
        data.altTextEn,
        data.isPrimary,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE_IMAGE)
  async deleteProductImage(
    @Payload() data: { productId: string; imageId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.productService.deleteImage(data.productId, data.imageId);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_SET_PRIMARY_IMAGE)
  async setPrimaryProductImage(
    @Payload() data: { productId: string; imageId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.setPrimaryImage(data.productId, data.imageId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_REORDER_IMAGES)
  async reorderProductImages(
    @Payload() data: { productId: string; imageIds: string[] },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.productService.reorderImages(data.productId, data.imageIds);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Stock ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_UPDATE)
  async updateStock(
    @Payload() data: { productId: string; dto: UpdateStockDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockService.updateStock(
        data.productId,
        data.dto.stockQuantity,
        data.dto.stockAlertThreshold,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_GET_INFO)
  async getStockInfo(@Payload() data: { productId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockService.getStockInfo(data.productId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS)
  async getStockAlerts(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockService.getStockAlerts();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_CHECK_AVAILABILITY)
  async checkStockAvailability(
    @Payload() data: { productId: string; quantity: number },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockService.checkAvailability(data.productId, data.quantity);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_RESERVE)
  async reserveStock(@Payload() data: ReserveStockDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.stockService.reserveStock(
        data.productId,
        data.cartId,
        data.quantity,
        data.userId,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_RELEASE)
  async releaseStock(@Payload() data: { cartId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.stockService.releaseReservation(data.cartId);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_CONFIRM)
  async confirmStock(@Payload() data: { cartId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.stockService.confirmReservation(data.cartId);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
