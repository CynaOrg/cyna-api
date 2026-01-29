import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ProductQueryDto,
  SearchProductDto,
  FeaturedProductsQueryDto,
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  AddProductImageDto,
  UpdateProductImageDto,
  ReorderImagesDto,
  AddProductCharacteristicDto,
  UpdateProductCharacteristicDto,
  BulkUpsertCharacteristicsDto,
} from './dto';

@Injectable()
export class CatalogService {
  private readonly TIMEOUT = 10000; // 10 seconds

  constructor(
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
  ) {}

  // ==================== Categories - Public ====================

  async getCategories(query: CategoryQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_CATEGORIES, query);
  }

  async getCategoryBySlug(slug: string, lang?: Language) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_CATEGORY_BY_SLUG, {
      slug,
      lang,
    });
  }

  // ==================== Categories - Admin ====================

  async getCategoriesAdmin(query: CategoryQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_CATEGORIES_ADMIN, query);
  }

  async getCategoryById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_CATEGORY_BY_ID, { id });
  }

  async createCategory(dto: CreateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CREATE_CATEGORY, dto);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.UPDATE_CATEGORY, {
      id,
      ...dto,
    });
  }

  async deleteCategory(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.DELETE_CATEGORY, { id });
  }

  // ==================== Products - Public ====================

  async getProducts(query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCTS, query);
  }

  async getProductBySlug(slug: string, lang?: Language) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT, { slug, lang });
  }

  async getFeaturedProducts(query: FeaturedProductsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_FEATURED_PRODUCTS, query);
  }

  async searchProducts(query: SearchProductDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.SEARCH_PRODUCTS, query);
  }

  // ==================== Products - Admin ====================

  async getProductsAdmin(query: ProductQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCTS_ADMIN, query);
  }

  async getProductById(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_BY_ID, { id });
  }

  async createProduct(dto: CreateProductDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.CREATE_PRODUCT, dto);
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT, {
      id,
      ...dto,
    });
  }

  async deleteProduct(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT, { id });
  }

  async updateStock(id: string, dto: UpdateStockDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.UPDATE_STOCK, { id, ...dto });
  }

  async getStock(productId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_STOCK, { productId });
  }

  // ==================== Product Images - Admin ====================

  async getProductImages(productId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_IMAGES, {
      productId,
    });
  }

  async addProductImage(productId: string, dto: AddProductImageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.ADD_PRODUCT_IMAGE, {
      productId,
      ...dto,
    });
  }

  async updateProductImage(id: string, dto: UpdateProductImageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT_IMAGE, {
      id,
      ...dto,
    });
  }

  async deleteProductImage(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT_IMAGE, { id });
  }

  async setPrimaryImage(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.SET_PRIMARY_IMAGE, { id });
  }

  async reorderImages(productId: string, dto: ReorderImagesDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.REORDER_IMAGES, {
      productId,
      ...dto,
    });
  }

  // ==================== Product Characteristics - Admin ====================

  async getProductCharacteristics(productId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.GET_PRODUCT_CHARACTERISTICS, {
      productId,
    });
  }

  async addProductCharacteristic(productId: string, dto: AddProductCharacteristicDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.ADD_PRODUCT_CHARACTERISTIC, {
      productId,
      ...dto,
    });
  }

  async updateProductCharacteristic(id: string, dto: UpdateProductCharacteristicDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.UPDATE_PRODUCT_CHARACTERISTIC, {
      id,
      ...dto,
    });
  }

  async deleteProductCharacteristic(id: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.DELETE_PRODUCT_CHARACTERISTIC, {
      id,
    });
  }

  async bulkUpsertCharacteristics(productId: string, dto: BulkUpsertCharacteristicsDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CATALOG.BULK_UPSERT_CHARACTERISTICS, {
      productId,
      ...dto,
    });
  }

  // ==================== Private Helper ====================

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.catalogClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
        catchError((err) => {
          // Convert RpcException errors to HttpException
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () =>
                new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          // Handle timeout errors
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
