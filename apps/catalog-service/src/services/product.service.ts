import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { TimeoutError } from 'rxjs';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_TTL,
  CACHE_KEYS,
  generateCacheKey,
  CACHE_PREFIXES,
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  FeaturedProductType,
} from '@cyna-api/common';
import { Product, Category, ProductCharacteristic, ProductImage, ProductType } from '../entities';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductSortBy,
  SortOrder,
} from '../dto';
import { CatalogEventsPublisher } from '../events';
import * as crypto from 'crypto';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

@Injectable()
export class ProductService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(ProductCharacteristic)
    private readonly characteristicRepository: Repository<ProductCharacteristic>,
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
    private readonly logger: CynaLoggerService,
    private readonly eventsPublisher: CatalogEventsPublisher,
    private readonly cacheService: CynaCacheService,
    @Inject(SERVICE_NAMES.CONTENT)
    private readonly contentClient: ClientProxy,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    void this.reconcileFeaturedFromContent();
  }

  private async reconcileFeaturedFromContent(): Promise<void> {
    const maxAttempts = 10;
    const baseDelayMs = 1500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const snapshot = await firstValueFrom(
          this.contentClient
            .send<{
              saasIds: string[];
              physicalIds: string[];
              licenseIds: string[];
            }>(MESSAGE_PATTERNS.CONTENT.GET_TOP_PRODUCTS_FULL_SYNC, {})
            .pipe(timeout(5000)),
        );
        await this.reconcileFeaturedFromFullSync(
          snapshot.saasIds ?? [],
          snapshot.physicalIds ?? [],
          snapshot.licenseIds ?? [],
        );
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`Featured reconcile attempt ${attempt}/${maxAttempts} failed: ${message}`);
        if (attempt === maxAttempts) {
          this.logger.error(
            'Featured reconcile gave up after max attempts; isFeatured may be out of sync until next admin action',
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId },
    });

    if (!category) {
      this.logger.warn(`Category not found: ${dto.categoryId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.categoryNotFound',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const existingBySlug = await this.productRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingBySlug) {
      this.logger.warn(`Product slug already exists: ${dto.slug}`);
      throw new RpcException({
        statusCode: 409,
        message: 'errors.catalog.productSlugExists',
        code: 'PRODUCT_SLUG_EXISTS',
      });
    }

    const existingBySku = await this.productRepository.findOne({
      where: { sku: dto.sku },
    });

    if (existingBySku) {
      this.logger.warn(`Product SKU already exists: ${dto.sku}`);
      throw new RpcException({
        statusCode: 409,
        message: 'errors.catalog.productSkuExists',
        code: 'PRODUCT_SKU_EXISTS',
      });
    }

    const product = this.productRepository.create({
      categoryId: dto.categoryId,
      slug: dto.slug,
      sku: dto.sku,
      nameFr: dto.nameFr,
      nameEn: dto.nameEn,
      descriptionFr: dto.descriptionFr,
      descriptionEn: dto.descriptionEn,
      shortDescriptionFr: dto.shortDescriptionFr,
      shortDescriptionEn: dto.shortDescriptionEn,
      productType: dto.productType,
      priceMonthly: dto.priceMonthly,
      priceYearly: dto.priceYearly,
      priceUnit: dto.priceUnit,
      stockQuantity: dto.stockQuantity,
      stockAlertThreshold: dto.stockAlertThreshold ?? 10,
      isAvailable: dto.isAvailable ?? true,
      isFeatured: false,
      displayOrder: dto.displayOrder ?? 0,
      stripeProductId: dto.stripeProductId,
      stripePriceIdMonthly: dto.stripePriceIdMonthly,
      stripePriceIdYearly: dto.stripePriceIdYearly,
      stripePriceIdUnit: dto.stripePriceIdUnit,
    });

    await this.productRepository.save(product);

    if (dto.isFeatured) {
      const featuredType = this.toFeaturedProductType(product.productType);
      if (featuredType) {
        try {
          await this.requestFeaturedToggle(product.id, featuredType, true);
          product.isFeatured = true;
          await this.productRepository.save(product);
        } catch (error) {
          this.logger.warn(
            `Could not feature new product ${product.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }

    if (dto.characteristics && dto.characteristics.length > 0) {
      const characteristics = dto.characteristics.map((char) =>
        this.characteristicRepository.create({
          productId: product.id,
          keyFr: char.keyFr,
          keyEn: char.keyEn,
          valueFr: char.valueFr,
          valueEn: char.valueEn,
          displayOrder: char.displayOrder ?? 0,
        }),
      );
      await this.characteristicRepository.save(characteristics);
    }

    this.logger.log(`Product created: ${product.id} (${product.slug})`);

    // Invalidate product caches
    await this.invalidateProductCache();

    const createdProduct = await this.findById(product.id);

    await this.eventsPublisher.emitProductCreated({
      productId: createdProduct.id,
      sku: createdProduct.sku,
      name: createdProduct.nameEn || createdProduct.nameFr,
      productType: createdProduct.productType,
      categoryId: createdProduct.categoryId,
      price: {
        monthly: createdProduct.priceMonthly ?? undefined,
        yearly: createdProduct.priceYearly ?? undefined,
        unit: createdProduct.priceUnit ?? undefined,
      },
      createdAt: createdProduct.createdAt,
    });

    return createdProduct;
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Generate cache key based on query parameters
    const queryHash = this.hashQuery(query);
    const cacheKey = generateCacheKey.productList(queryHash);

    const cached = await this.cacheService.get<PaginatedResult<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    const queryBuilder = this.createBaseQueryBuilder();
    this.applyFilters(queryBuilder, query);
    this.applySorting(queryBuilder, query.sortBy, query.sortOrder);

    const [products, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    const result = {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for shorter duration as lists can change frequently
    await this.cacheService.set(cacheKey, result, CACHE_TTL.SHORT);

    return result;
  }

  /**
   * Admin variant of findAll. Returns the full image array (not just the
   * primary one) and bypasses the public cache to avoid leaking admin
   * payloads through the read-through cache.
   */
  async findAllAdmin(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images');
    this.applyFilters(queryBuilder, query);
    this.applySorting(queryBuilder, query.sortBy, query.sortOrder);

    const [products, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin variant of findById. Bypasses the read-through cache so that
   * the back-office always observes the latest state right after a
   * mutation, and exposes the entity unfiltered for the admin DTO mapper.
   */
  async findByIdAdmin(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    return product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const cacheKey = generateCacheKey.product(slug);

    const cached = await this.cacheService.get<Product>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productRepository.findOne({
      where: { slug },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // Cache individual product for longer duration
    await this.cacheService.set(cacheKey, product, CACHE_TTL.MEDIUM);

    return product;
  }

  async findById(id: string): Promise<Product> {
    const cacheKey = generateCacheKey.productById(id);

    const cached = await this.cacheService.get<Product>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // Cache individual product
    await this.cacheService.set(cacheKey, product, CACHE_TTL.MEDIUM);

    return product;
  }

  /**
   * Batch lookup by ids. Returns products in the same order as the input ids
   * (missing ids are simply omitted). Used by order-service to avoid N+1 RPC
   * round-trips when enriching a cart.
   */
  async findByIds(ids: string[]): Promise<Product[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    // Deduplicate while preserving order
    const uniqueIds = Array.from(new Set(ids));

    const products = await this.productRepository.find({
      where: { id: In(uniqueIds) },
      relations: ['category', 'images', 'characteristics'],
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    return uniqueIds.map((id) => productMap.get(id)).filter((p): p is Product => p !== undefined);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);

    if (dto.slug && dto.slug !== product.slug) {
      const existingBySlug = await this.productRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingBySlug) {
        this.logger.warn(`Product slug already exists: ${dto.slug}`);
        throw new RpcException({
          statusCode: 409,
          message: 'errors.catalog.productSlugExists',
          code: 'PRODUCT_SLUG_EXISTS',
        });
      }
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existingBySku = await this.productRepository.findOne({
        where: { sku: dto.sku },
      });

      if (existingBySku) {
        this.logger.warn(`Product SKU already exists: ${dto.sku}`);
        throw new RpcException({
          statusCode: 409,
          message: 'errors.catalog.productSkuExists',
          code: 'PRODUCT_SKU_EXISTS',
        });
      }
    }

    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId },
      });

      if (!category) {
        this.logger.warn(`Category not found: ${dto.categoryId}`);
        throw new RpcException({
          statusCode: 404,
          message: 'errors.catalog.categoryNotFound',
          code: 'CATEGORY_NOT_FOUND',
        });
      }
    }

    const { characteristics, isFeatured: nextFeatured, ...productData } = dto;
    Object.assign(product, productData);

    if (nextFeatured !== undefined) {
      const featuredType = this.toFeaturedProductType(product.productType);
      if (featuredType) {
        await this.requestFeaturedToggle(product.id, featuredType, nextFeatured);
        product.isFeatured = nextFeatured;
      } else {
        product.isFeatured = false;
      }
    }

    await this.productRepository.save(product);

    if (characteristics !== undefined) {
      await this.characteristicRepository.delete({ productId: id });

      if (characteristics.length > 0) {
        const newCharacteristics = characteristics.map((char) =>
          this.characteristicRepository.create({
            productId: id,
            keyFr: char.keyFr,
            keyEn: char.keyEn,
            valueFr: char.valueFr,
            valueEn: char.valueEn,
            displayOrder: char.displayOrder ?? 0,
          }),
        );
        await this.characteristicRepository.save(newCharacteristics);
      }
    }

    this.logger.log(`Product updated: ${product.id} (${product.slug})`);

    // Invalidate caches for this product
    await this.invalidateProductCache(id, product.slug);

    // Clear the specific product cache before fetching
    await this.cacheService.del(generateCacheKey.productById(id));

    const updatedProduct = await this.findById(id);

    await this.eventsPublisher.emitProductUpdated({
      productId: updatedProduct.id,
      sku: updatedProduct.sku,
      updatedFields: Object.keys(dto),
      updatedAt: updatedProduct.updatedAt,
    });

    return updatedProduct;
  }

  async delete(id: string): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const deletedProductData = {
      productId: product.id,
      sku: product.sku,
      productName: product.nameEn || product.nameFr,
    };

    const slug = product.slug;
    // Soft delete: TypeORM sets deleted_at via the @DeleteDateColumn on
    // BaseEntity. Subsequent find()/findOne()/QueryBuilder calls exclude
    // soft-deleted rows by default, so the product disappears from the
    // catalog while order history and license keys keep their FK target.
    // TODO(PROD-10): expose an admin "trash" endpoint with `withDeleted: true`
    // and a restore action when product recovery is needed.
    await this.productRepository.softDelete(id);
    this.logger.log(`Product soft-deleted: ${id}`);

    // Invalidate caches
    await this.invalidateProductCache(id, slug);

    await this.eventsPublisher.emitProductDeleted({
      ...deletedProductData,
      deletedAt: new Date(),
    });
  }

  async bulkDelete(ids: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const id of ids) {
      try {
        const product = await this.productRepository.findOne({ where: { id } });
        if (!product) {
          failedIds.push(id);
          continue;
        }

        const deletedProductData = {
          productId: product.id,
          sku: product.sku,
          productName: product.nameEn || product.nameFr,
        };

        // Soft delete (see delete() for rationale).
        await this.productRepository.softDelete(id);
        deletedCount += 1;

        await this.eventsPublisher.emitProductDeleted({
          ...deletedProductData,
          deletedAt: new Date(),
        });
      } catch (error) {
        this.logger.warn(
          `Failed to delete product ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failedIds.push(id);
      }
    }

    // Invalidate product caches once at the end
    if (deletedCount > 0) {
      await this.invalidateProductCache();
    }

    this.logger.log(
      `Bulk soft-delete completed: ${deletedCount} deleted, ${failedIds.length} failed`,
    );

    return { deletedCount, failedIds };
  }

  async search(searchTerm: string, query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.createBaseQueryBuilder();

    queryBuilder.andWhere(
      '(product.nameFr ILIKE :search OR product.nameEn ILIKE :search OR product.descriptionFr ILIKE :search OR product.descriptionEn ILIKE :search)',
      { search: `%${searchTerm}%` },
    );

    this.applyFilters(queryBuilder, query);
    this.applySorting(queryBuilder, query.sortBy, query.sortOrder);

    const [products, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findFeatured(limit: number = 10): Promise<Product[]> {
    const cacheKey = `${CACHE_KEYS.PRODUCTS_FEATURED}:${limit}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.productRepository.find({
          where: { isFeatured: true, isAvailable: true },
          relations: ['category', 'images'],
          order: { displayOrder: 'ASC' },
          take: limit,
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findByCategory(
    categoryId: string,
    query: ProductQueryDto,
  ): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Generate cache key based on category and query
    const queryHash = this.hashQuery({ ...query, categoryId });
    const cacheKey = `${generateCacheKey.productsByCategory(categoryId)}:${queryHash}`;

    const cached = await this.cacheService.get<PaginatedResult<Product>>(cacheKey);
    if (cached) {
      return cached;
    }

    const queryBuilder = this.createBaseQueryBuilder();
    queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });

    if (query.isAvailable !== undefined) {
      queryBuilder.andWhere('product.isAvailable = :isAvailable', {
        isAvailable: query.isAvailable,
      });
    }

    this.applySorting(queryBuilder, query.sortBy, query.sortOrder);

    const [products, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    const result = {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for shorter duration
    await this.cacheService.set(cacheKey, result, CACHE_TTL.SHORT);

    return result;
  }

  // ==================== Image Management ====================

  async addImage(
    productId: string,
    imageUrl: string,
    altTextFr?: string,
    altTextEn?: string,
    isPrimary?: boolean,
  ): Promise<ProductImage> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['images'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const existingImages = product.images || [];
    const isFirstImage = existingImages.length === 0;
    const shouldBePrimary = isPrimary ?? isFirstImage;

    if (shouldBePrimary && existingImages.length > 0) {
      await this.imageRepository.update({ productId }, { isPrimary: false });
    }

    const maxDisplayOrder = existingImages.reduce(
      (max, img) => Math.max(max, img.displayOrder),
      -1,
    );

    const image = this.imageRepository.create({
      productId,
      imageUrl,
      altTextFr,
      altTextEn,
      isPrimary: shouldBePrimary,
      displayOrder: maxDisplayOrder + 1,
    });

    await this.imageRepository.save(image);
    this.logger.log(`Image added to product ${productId}: ${image.id}`);

    return image;
  }

  async deleteImage(productId: string, imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      this.logger.warn(`Image not found: ${imageId} for product ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.imageNotFound',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    const wasPrimary = image.isPrimary;
    await this.imageRepository.remove(image);

    if (wasPrimary) {
      const nextImage = await this.imageRepository.findOne({
        where: { productId },
        order: { displayOrder: 'ASC' },
      });

      if (nextImage) {
        nextImage.isPrimary = true;
        await this.imageRepository.save(nextImage);
        this.logger.log(`New primary image set for product ${productId}: ${nextImage.id}`);
      }
    }

    this.logger.log(`Image deleted from product ${productId}: ${imageId}`);
  }

  async setPrimaryImage(productId: string, imageId: string): Promise<ProductImage> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      this.logger.warn(`Image not found: ${imageId} for product ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.imageNotFound',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    await this.imageRepository.update({ productId }, { isPrimary: false });

    image.isPrimary = true;
    await this.imageRepository.save(image);

    this.logger.log(`Primary image set for product ${productId}: ${imageId}`);

    return image;
  }

  async reorderImages(productId: string, imageIds: string[]): Promise<ProductImage[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['images'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const existingImageIds = new Set(product.images.map((img) => img.id));
    const invalidIds = imageIds.filter((id) => !existingImageIds.has(id));

    if (invalidIds.length > 0) {
      this.logger.warn(`Invalid image IDs for product ${productId}: ${invalidIds.join(', ')}`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.invalidImageIds',
        code: 'INVALID_IMAGE_IDS',
      });
    }

    const updates = imageIds.map((id, index) =>
      this.imageRepository.update({ id }, { displayOrder: index }),
    );

    await Promise.all(updates);

    const reorderedImages = await this.imageRepository.find({
      where: { productId },
      order: { displayOrder: 'ASC' },
    });

    this.logger.log(`Images reordered for product ${productId}`);

    return reorderedImages;
  }

  // ==================== Stock Management ====================

  async updateStock(
    productId: string,
    stockQuantity: number,
    stockAlertThreshold?: number,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.stockPhysicalOnly',
        code: 'STOCK_NOT_APPLICABLE',
      });
    }

    product.stockQuantity = stockQuantity;
    if (stockAlertThreshold !== undefined) {
      product.stockAlertThreshold = stockAlertThreshold;
    }

    await this.productRepository.save(product);
    this.logger.log(`Stock updated for product ${productId}: ${stockQuantity}`);

    return this.findById(productId);
  }

  async checkStock(
    productId: string,
    requestedQuantity: number,
  ): Promise<{ available: boolean; currentStock: number; requestedQuantity: number }> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      return {
        available: true,
        currentStock: -1,
        requestedQuantity,
      };
    }

    const currentStock = product.stockQuantity ?? 0;
    const available = currentStock >= requestedQuantity;

    return {
      available,
      currentStock,
      requestedQuantity,
    };
  }

  async getStockAlerts(): Promise<Product[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .where('product.productType = :type', { type: ProductType.PHYSICAL })
      .andWhere('product.stockQuantity <= product.stockAlertThreshold')
      .orderBy('product.stockQuantity', 'ASC')
      .getMany();
  }

  async decrementStock(productId: string, quantity: number): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.stockPhysicalOnly',
        code: 'STOCK_NOT_APPLICABLE',
      });
    }

    const currentStock = product.stockQuantity ?? 0;
    if (currentStock < quantity) {
      this.logger.warn(
        `Insufficient stock for product ${productId}: ${currentStock} < ${quantity}`,
      );
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.insufficientStock',
        code: 'INSUFFICIENT_STOCK',
      });
    }

    product.stockQuantity = currentStock - quantity;
    await this.productRepository.save(product);

    this.logger.log(
      `Stock decremented for product ${productId}: ${currentStock} -> ${product.stockQuantity}`,
    );

    return this.findById(productId);
  }

  async incrementStock(productId: string, quantity: number): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.stockPhysicalOnly',
        code: 'STOCK_NOT_APPLICABLE',
      });
    }

    const currentStock = product.stockQuantity ?? 0;
    product.stockQuantity = currentStock + quantity;
    await this.productRepository.save(product);

    this.logger.log(
      `Stock incremented for product ${productId}: ${currentStock} -> ${product.stockQuantity}`,
    );

    return this.findById(productId);
  }

  // ==================== Private Helpers ====================

  private createBaseQueryBuilder(): SelectQueryBuilder<Product> {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images', 'images.isPrimary = :isPrimary', {
        isPrimary: true,
      });
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Product>, query: ProductQueryDto): void {
    if (query.categorySlug) {
      queryBuilder.andWhere('category.slug = :categorySlug', { categorySlug: query.categorySlug });
    }

    if (query.productType) {
      queryBuilder.andWhere('product.productType = :productType', {
        productType: query.productType,
      });
    }

    if (query.isAvailable !== undefined) {
      queryBuilder.andWhere('product.isAvailable = :isAvailable', {
        isAvailable: query.isAvailable,
      });
    }

    if (query.isFeatured !== undefined) {
      queryBuilder.andWhere('product.isFeatured = :isFeatured', { isFeatured: query.isFeatured });
    }

    if (query.minPrice !== undefined) {
      queryBuilder.andWhere(
        '(product.priceMonthly >= :minPrice OR product.priceUnit >= :minPrice)',
        { minPrice: query.minPrice },
      );
    }

    if (query.maxPrice !== undefined) {
      queryBuilder.andWhere(
        '(product.priceMonthly <= :maxPrice OR product.priceUnit <= :maxPrice)',
        { maxPrice: query.maxPrice },
      );
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(product.nameFr ILIKE :search OR product.nameEn ILIKE :search OR product.descriptionFr ILIKE :search OR product.descriptionEn ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
  }

  private applySorting(
    queryBuilder: SelectQueryBuilder<Product>,
    sortBy?: ProductSortBy,
    sortOrder?: SortOrder,
  ): void {
    const order = sortOrder === SortOrder.DESC ? 'DESC' : 'ASC';

    switch (sortBy) {
      case ProductSortBy.PRICE_MONTHLY:
        queryBuilder.orderBy('product.priceMonthly', order, 'NULLS LAST');
        break;
      case ProductSortBy.PRICE_UNIT:
        queryBuilder.orderBy('product.priceUnit', order, 'NULLS LAST');
        break;
      case ProductSortBy.CREATED_AT:
        queryBuilder.orderBy('product.createdAt', order);
        break;
      case ProductSortBy.DISPLAY_ORDER:
      default:
        queryBuilder.orderBy('product.displayOrder', order);
        break;
    }
  }

  /**
   * Generate a hash from query parameters for cache key
   */
  private hashQuery(query: object): string {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    return crypto.createHash('md5').update(normalized).digest('hex').slice(0, 12);
  }

  /**
   * Invalidate product caches
   * @param id Product ID (optional)
   * @param slug Product slug (optional)
   */
  private async invalidateProductCache(id?: string, slug?: string): Promise<void> {
    // Invalidate list and featured caches
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.PRODUCT}list:*`);
    await this.cacheService.delByPattern(`${CACHE_KEYS.PRODUCTS_FEATURED}*`);
    await this.cacheService.delByPattern(`${CACHE_KEYS.PRODUCTS_BY_CATEGORY}*`);

    // Invalidate specific product caches if provided
    if (id) {
      await this.cacheService.del(generateCacheKey.productById(id));
    }
    if (slug) {
      await this.cacheService.del(generateCacheKey.product(slug));
    }
  }

  async syncFeaturedFromTopProducts(
    productType: FeaturedProductType,
    added: string[],
    removed: string[],
  ): Promise<void> {
    if (added.length > 0) {
      await this.productRepository
        .createQueryBuilder()
        .update(Product)
        .set({ isFeatured: true })
        .where('id IN (:...ids)', { ids: added })
        .andWhere('isFeatured = :current', { current: false })
        .execute();
    }
    if (removed.length > 0) {
      await this.productRepository
        .createQueryBuilder()
        .update(Product)
        .set({ isFeatured: false })
        .where('id IN (:...ids)', { ids: removed })
        .andWhere('isFeatured = :current', { current: true })
        .execute();
    }
    if (added.length > 0 || removed.length > 0) {
      await this.invalidateProductCache();
      this.logger.log(
        `Synced isFeatured from top_products (${productType}): +${added.length} -${removed.length}`,
      );
    }
  }

  async reconcileFeaturedFromFullSync(
    saasIds: string[],
    physicalIds: string[],
    licenseIds: string[],
  ): Promise<void> {
    const featuredIds = [...saasIds, ...physicalIds, ...licenseIds];

    if (featuredIds.length > 0) {
      await this.productRepository
        .createQueryBuilder()
        .update(Product)
        .set({ isFeatured: true })
        .where('id IN (:...ids)', { ids: featuredIds })
        .andWhere('isFeatured = :current', { current: false })
        .execute();
    }

    const offTypes: ProductType[] = [ProductType.SAAS, ProductType.PHYSICAL, ProductType.LICENSE];

    const offQb = this.productRepository
      .createQueryBuilder()
      .update(Product)
      .set({ isFeatured: false })
      .where('productType IN (:...types)', { types: offTypes })
      .andWhere('isFeatured = :current', { current: true });

    if (featuredIds.length > 0) {
      offQb.andWhere('id NOT IN (:...keep)', { keep: featuredIds });
    }
    await offQb.execute();

    await this.invalidateProductCache();
    this.logger.log(
      `Reconciled isFeatured from full_sync (saas=${saasIds.length}, physical=${physicalIds.length}, license=${licenseIds.length})`,
    );
  }

  private toFeaturedProductType(productType: ProductType): FeaturedProductType | null {
    if (productType === ProductType.SAAS) return 'saas';
    if (productType === ProductType.PHYSICAL) return 'physical';
    if (productType === ProductType.LICENSE) return 'license';
    return null;
  }

  private async requestFeaturedToggle(
    productId: string,
    productType: FeaturedProductType,
    featured: boolean,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.contentClient
          .send(MESSAGE_PATTERNS.CONTENT.ADMIN_TOGGLE_FEATURED, {
            productId,
            productType,
            featured,
          })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                throw new RpcException({
                  statusCode: 503,
                  message: 'errors.catalog.contentServiceUnavailable',
                  code: 'CONTENT_SERVICE_TIMEOUT',
                });
              }
              throw err;
            }),
          ),
      );
    } catch (err) {
      if (err instanceof RpcException) throw err;
      if (err && typeof err === 'object' && 'statusCode' in err) {
        throw new RpcException(err as Record<string, unknown>);
      }
      throw new RpcException({
        statusCode: 500,
        message: err instanceof Error ? err.message : 'Failed to toggle featured product',
        code: 'CONTENT_SYNC_FAILED',
      });
    }
  }
}
