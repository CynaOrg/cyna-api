import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, retry, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  RequestUploadUrlDto,
  ConfirmUploadDto,
  AdminProductResponse,
  PaginatedAdminProductResponse,
} from './dto';

@Injectable()
export class CatalogService {
  private readonly TIMEOUT = 10000; // 10 seconds

  constructor(
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
  ) {}

  // ==================== Categories ====================

  // No retry: mutation, must stay idempotent
  async createCategory(dto: CreateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_CREATE, dto);
  }

  // No retry: mutation, must stay idempotent
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_UPDATE, { id, dto });
  }

  // No retry: mutation, must stay idempotent
  async deleteCategory(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_DELETE, { id });
  }

  async findAllCategories(query: { isActive?: boolean; lang?: Language }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL, query, { retry: true });
  }

  async findAllCategoriesAdmin(query: { isActive?: boolean }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL_ADMIN, query, {
      retry: true,
    });
  }

  async findCategoryBySlug(slug: string, lang?: Language) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_SLUG,
      { slug, lang },
      { retry: true },
    );
  }

  async findCategoryById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_ID, { id }, { retry: true });
  }

  // No retry: mutation, must stay idempotent
  async reorderCategories(categoryIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_REORDER, { categoryIds });
  }

  // ==================== Products ====================

  /**
   * PROD-15: returns the admin DTO shape so the back-office state can
   * be refreshed from the response without an extra GET.
   */
  // No retry: mutation, must stay idempotent
  async createProduct(dto: CreateProductDto): Promise<AdminProductResponse> {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_CREATE, dto);
  }

  /**
   * PROD-15: returns the admin DTO shape (see createProduct above).
   */
  // No retry: mutation, must stay idempotent
  async updateProduct(id: string, dto: UpdateProductDto): Promise<AdminProductResponse> {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_UPDATE, { id, dto });
  }

  // No retry: mutation, must stay idempotent
  async deleteProduct(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE, { id });
  }

  // No retry: mutation, must stay idempotent
  async bulkDeleteProducts(
    productIds: string[],
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_BULK_DELETE, { productIds });
  }

  async findAllProducts(query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, query, { retry: true });
  }

  /**
   * Admin variant of findAllProducts: returns the bilingual admin DTO
   * (nameFr/nameEn + full images[]).
   */
  async findAllProductsAdmin(query: ProductQueryDto): Promise<PaginatedAdminProductResponse> {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL_ADMIN, query, {
      retry: true,
    });
  }

  async findProductBySlug(slug: string, lang?: Language) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG,
      { slug, lang },
      { retry: true },
    );
  }

  async findProductById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id }, { retry: true });
  }

  /**
   * Admin variant of findProductById: returns the bilingual admin DTO
   * (nameFr/nameEn + full images[]).
   */
  async findProductByIdAdmin(id: string): Promise<AdminProductResponse> {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID_ADMIN,
      { id },
      { retry: true },
    );
  }

  async searchProducts(searchTerm: string, query: ProductQueryDto) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH,
      { searchTerm, query },
      { retry: true },
    );
  }

  async findFeaturedProducts(limit?: number, lang?: Language) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_FEATURED,
      { limit, lang },
      { retry: true },
    );
  }

  async findProductsByCategory(categoryId: string, query: ProductQueryDto) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_CATEGORY,
      {
        categoryId,
        query,
      },
      { retry: true },
    );
  }

  // ==================== Product Images ====================

  // No retry: mutation, must stay idempotent
  async addProductImage(
    productId: string,
    imageUrl: string,
    altTextFr?: string,
    altTextEn?: string,
    isPrimary?: boolean,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_ADD_IMAGE, {
      productId,
      imageUrl,
      altTextFr,
      altTextEn,
      isPrimary,
    });
  }

  // No retry: mutation, must stay idempotent
  async deleteProductImage(productId: string, imageId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE_IMAGE, { productId, imageId });
  }

  // No retry: mutation, must stay idempotent
  async setPrimaryProductImage(productId: string, imageId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_SET_PRIMARY_IMAGE, {
      productId,
      imageId,
    });
  }

  // No retry: mutation, must stay idempotent
  async reorderProductImages(productId: string, imageIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_REORDER_IMAGES, {
      productId,
      imageIds,
    });
  }

  // No retry: mutation, must stay idempotent
  async requestImageUploadUrl(productId: string, dto: RequestUploadUrlDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_REQUEST_UPLOAD_URL, {
      ...dto,
      productId,
    });
  }

  // No retry: mutation, must stay idempotent
  async confirmImageUpload(productId: string, dto: ConfirmUploadDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_CONFIRM_IMAGE_UPLOAD, {
      ...dto,
      productId,
    });
  }

  // ==================== Stock ====================

  // No retry: mutation, must stay idempotent
  async updateStock(
    productId: string,
    dto: { stockQuantity: number; stockAlertThreshold?: number },
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_UPDATE, { productId, dto });
  }

  async getStockInfo(productId: string) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.STOCK_GET_INFO,
      { productId },
      { retry: true },
    );
  }

  async getStockAlerts() {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS, {}, { retry: true });
  }

  async checkStockAvailability(productId: string, quantity: number) {
    return this.sendMessage(
      MESSAGE_PATTERNS.CATALOG.STOCK_CHECK_AVAILABILITY,
      {
        productId,
        quantity,
      },
      { retry: true },
    );
  }

  // No retry: mutation, must stay idempotent
  async reserveStock(dto: {
    productId: string;
    cartId: string;
    userId?: string;
    quantity: number;
  }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_RESERVE, dto);
  }

  // No retry: mutation, must stay idempotent
  async releaseStock(cartId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_RELEASE, { cartId });
  }

  // No retry: mutation, must stay idempotent
  async confirmStock(cartId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_CONFIRM, { cartId });
  }

  // ==================== Private Helper ====================

  private async sendMessage<T>(
    pattern: { cmd: string },
    data: T,
    options: { retry?: boolean } = {},
  ) {
    const obs = this.catalogClient.send(pattern, data).pipe(timeout(this.TIMEOUT));
    const withRetry = options.retry ? obs.pipe(retry({ count: 2, delay: 1000 })) : obs;
    return firstValueFrom(
      withRetry.pipe(
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Catalog service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
