import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  RequestUploadUrlDto,
  ConfirmUploadDto,
} from './dto';

@Injectable()
export class CatalogService {
  private readonly TIMEOUT = 10000; // 10 seconds

  constructor(
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
  ) {}

  // ==================== Categories ====================

  async createCategory(dto: CreateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_CREATE, dto);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_UPDATE, { id, dto });
  }

  async deleteCategory(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_DELETE, { id });
  }

  async findAllCategories(query: { isActive?: boolean; lang?: Language }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL, query);
  }

  async findAllCategoriesAdmin(query: { isActive?: boolean }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL_ADMIN, query);
  }

  async findCategoryBySlug(slug: string, lang?: Language) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_SLUG, { slug, lang });
  }

  async findCategoryById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_ID, { id });
  }

  async reorderCategories(categoryIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CATEGORY_REORDER, { categoryIds });
  }

  // ==================== Products ====================

  async createProduct(dto: CreateProductDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_CREATE, dto);
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_UPDATE, { id, dto });
  }

  async deleteProduct(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE, { id });
  }

  async bulkDeleteProducts(
    productIds: string[],
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_BULK_DELETE, { productIds });
  }

  async findAllProducts(query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, query);
  }

  async findProductBySlug(slug: string, lang?: Language) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG, { slug, lang });
  }

  async findProductById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id });
  }

  async searchProducts(searchTerm: string, query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH, { searchTerm, query });
  }

  async findFeaturedProducts(limit?: number, lang?: Language) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_FEATURED, { limit, lang });
  }

  async findProductsByCategory(categoryId: string, query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_CATEGORY, {
      categoryId,
      query,
    });
  }

  // ==================== Product Images ====================

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

  async deleteProductImage(productId: string, imageId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE_IMAGE, { productId, imageId });
  }

  async setPrimaryProductImage(productId: string, imageId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_SET_PRIMARY_IMAGE, {
      productId,
      imageId,
    });
  }

  async reorderProductImages(productId: string, imageIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_REORDER_IMAGES, {
      productId,
      imageIds,
    });
  }

  async requestImageUploadUrl(productId: string, dto: RequestUploadUrlDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_REQUEST_UPLOAD_URL, {
      ...dto,
      productId,
    });
  }

  async confirmImageUpload(productId: string, dto: ConfirmUploadDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.PRODUCT_CONFIRM_IMAGE_UPLOAD, {
      ...dto,
      productId,
    });
  }

  // ==================== Stock ====================

  async updateStock(
    productId: string,
    dto: { stockQuantity: number; stockAlertThreshold?: number },
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_UPDATE, { productId, dto });
  }

  async getStockInfo(productId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_GET_INFO, { productId });
  }

  async getStockAlerts() {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS, {});
  }

  async checkStockAvailability(productId: string, quantity: number) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_CHECK_AVAILABILITY, {
      productId,
      quantity,
    });
  }

  async reserveStock(dto: {
    productId: string;
    cartId: string;
    userId?: string;
    quantity: number;
  }) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_RESERVE, dto);
  }

  async releaseStock(cartId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_RELEASE, { cartId });
  }

  async confirmStock(cartId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.STOCK_CONFIRM, { cartId });
  }

  // ==================== Private Helper ====================

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.catalogClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
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
