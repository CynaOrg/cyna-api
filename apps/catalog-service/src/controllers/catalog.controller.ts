import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { CategoryService, ProductService, StockService, ImageService } from '../services';
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
  RequestUploadUrlDto,
  ConfirmUploadDto,
} from '../dto';

@Controller()
export class CatalogController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
    private readonly stockService: StockService,
    private readonly imageService: ImageService,
  ) {}

  // ==================== Categories ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_CREATE)
  async createCategory(@Payload() data: CreateCategoryDto) {
    const category = await this.categoryService.create(data);
    return CategoryResponseDto.fromEntity(category);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_UPDATE)
  async updateCategory(@Payload() data: { id: string; dto: UpdateCategoryDto }) {
    const category = await this.categoryService.update(data.id, data.dto);
    return CategoryResponseDto.fromEntity(category);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_DELETE)
  async deleteCategory(@Payload() data: { id: string }) {
    await this.categoryService.delete(data.id);
    return { success: true };
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL)
  async findAllCategories(@Payload() data: CategoryQueryDto) {
    const categories = await this.categoryService.findAll(data);
    const lang = data.lang ?? Language.FR;
    return CategoryResponseDto.fromEntities(categories, lang);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL_ADMIN)
  async findAllCategoriesAdmin(@Payload() data: CategoryQueryDto) {
    return this.categoryService.findAll(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_SLUG)
  async findCategoryBySlug(@Payload() data: { slug: string; lang?: Language }) {
    const category = await this.categoryService.findBySlug(data.slug);
    return CategoryResponseDto.fromEntity(category, data.lang ?? Language.FR);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_ID)
  async findCategoryById(@Payload() data: { id: string }) {
    return this.categoryService.findById(data.id);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CATEGORY_REORDER)
  async reorderCategories(@Payload() data: { categoryIds: string[] }) {
    const categories = await this.categoryService.reorder(data.categoryIds);
    return CategoryResponseDto.fromEntities(categories, Language.FR);
  }

  // ==================== Products ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_CREATE)
  async createProduct(@Payload() data: CreateProductDto) {
    const product = await this.productService.create(data);
    return ProductDetailResponseDto.fromEntity(product);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_UPDATE)
  async updateProduct(@Payload() data: { id: string; dto: UpdateProductDto }) {
    const product = await this.productService.update(data.id, data.dto);
    return ProductDetailResponseDto.fromEntity(product);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE)
  async deleteProduct(@Payload() data: { id: string }) {
    await this.productService.delete(data.id);
    return { success: true };
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL)
  async findAllProducts(@Payload() data: ProductQueryDto) {
    const { data: products, meta } = await this.productService.findAll(data);
    const lang = data.lang ?? Language.FR;
    return PaginatedProductResponseDto.create(products, meta.total, meta.page, meta.limit, lang);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG)
  async findProductBySlug(@Payload() data: { slug: string; lang?: Language }) {
    const product = await this.productService.findBySlug(data.slug);
    return ProductDetailResponseDto.fromEntity(product, data.lang ?? Language.FR);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID)
  async findProductById(@Payload() data: { id: string }) {
    return this.productService.findById(data.id);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH)
  async searchProducts(@Payload() data: { searchTerm: string; query: ProductQueryDto }) {
    const { data: products, meta } = await this.productService.search(data.searchTerm, data.query);
    const lang = data.query.lang ?? Language.FR;
    return PaginatedProductResponseDto.create(products, meta.total, meta.page, meta.limit, lang);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_FEATURED)
  async findFeaturedProducts(@Payload() data: { limit?: number; lang?: Language }) {
    const products = await this.productService.findFeatured(data.limit ?? 10);
    return ProductListResponseDto.fromEntities(products, data.lang ?? Language.FR);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_CATEGORY)
  async findProductsByCategory(@Payload() data: { categoryId: string; query: ProductQueryDto }) {
    const { data: products, meta } = await this.productService.findByCategory(
      data.categoryId,
      data.query,
    );
    const lang = data.query.lang ?? Language.FR;
    return PaginatedProductResponseDto.create(products, meta.total, meta.page, meta.limit, lang);
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
  ) {
    return this.productService.addImage(
      data.productId,
      data.imageUrl,
      data.altTextFr,
      data.altTextEn,
      data.isPrimary,
    );
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE_IMAGE)
  async deleteProductImage(@Payload() data: { productId: string; imageId: string }) {
    await this.imageService.deleteImage(data.productId, data.imageId);
    return { success: true };
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_REQUEST_UPLOAD_URL)
  async requestImageUploadUrl(@Payload() dto: RequestUploadUrlDto) {
    return this.imageService.requestUploadUrl(dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_CONFIRM_IMAGE_UPLOAD)
  async confirmImageUpload(@Payload() dto: ConfirmUploadDto) {
    return this.imageService.confirmUpload(dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_SET_PRIMARY_IMAGE)
  async setPrimaryProductImage(@Payload() data: { productId: string; imageId: string }) {
    return this.productService.setPrimaryImage(data.productId, data.imageId);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.PRODUCT_REORDER_IMAGES)
  async reorderProductImages(@Payload() data: { productId: string; imageIds: string[] }) {
    return this.productService.reorderImages(data.productId, data.imageIds);
  }

  // ==================== Stock ====================

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_UPDATE)
  async updateStock(@Payload() data: { productId: string; dto: UpdateStockDto }) {
    return this.stockService.updateStock(
      data.productId,
      data.dto.stockQuantity,
      data.dto.stockAlertThreshold,
    );
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_GET_INFO)
  async getStockInfo(@Payload() data: { productId: string }) {
    return this.stockService.getStockInfo(data.productId);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS)
  async getStockAlerts() {
    return this.stockService.getStockAlerts();
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_CHECK_AVAILABILITY)
  async checkStockAvailability(@Payload() data: { productId: string; quantity: number }) {
    return this.stockService.checkAvailability(data.productId, data.quantity);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_RESERVE)
  async reserveStock(@Payload() data: ReserveStockDto) {
    return this.stockService.reserveStock(data.productId, data.cartId, data.quantity, data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_RELEASE)
  async releaseStock(@Payload() data: { cartId: string }) {
    await this.stockService.releaseReservation(data.cartId);
    return { success: true };
  }

  @MessagePattern(MESSAGE_PATTERNS.CATALOG.STOCK_CONFIRM)
  async confirmStock(@Payload() data: { cartId: string }) {
    await this.stockService.confirmReservation(data.cartId);
    return { success: true };
  }
}
