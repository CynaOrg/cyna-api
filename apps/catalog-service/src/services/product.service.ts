import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { Product, Category, ProductCharacteristic, ProductImage, ProductType } from '../entities';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductSortBy,
  SortOrder,
} from '../dto';
import { CatalogEventsPublisher } from '../events';

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
export class ProductService {
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
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId },
    });

    if (!category) {
      this.logger.warn(`Category not found: ${dto.categoryId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
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
        message: 'Product slug already exists',
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
        message: 'Product SKU already exists',
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
      isFeatured: dto.isFeatured ?? false,
      displayOrder: dto.displayOrder ?? 0,
      stripeProductId: dto.stripeProductId,
      stripePriceIdMonthly: dto.stripePriceIdMonthly,
      stripePriceIdYearly: dto.stripePriceIdYearly,
      stripePriceIdUnit: dto.stripePriceIdUnit,
    });

    await this.productRepository.save(product);

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

    const queryBuilder = this.createBaseQueryBuilder();
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

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { slug },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    return product;
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    return product;
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
          message: 'Product slug already exists',
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
          message: 'Product SKU already exists',
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
          message: 'Category not found',
          code: 'CATEGORY_NOT_FOUND',
        });
      }
    }

    const { characteristics, ...productData } = dto;
    Object.assign(product, productData);
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
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const deletedProductData = {
      productId: product.id,
      sku: product.sku,
      productName: product.nameEn || product.nameFr,
    };

    await this.productRepository.remove(product);
    this.logger.log(`Product deleted: ${id}`);

    await this.eventsPublisher.emitProductDeleted({
      ...deletedProductData,
      deletedAt: new Date(),
    });
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
    return this.productRepository.find({
      where: { isFeatured: true, isAvailable: true },
      relations: ['category', 'images'],
      order: { displayOrder: 'ASC' },
      take: limit,
    });
  }

  async findByCategory(
    categoryId: string,
    query: ProductQueryDto,
  ): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.createBaseQueryBuilder();
    queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });

    if (query.isAvailable !== undefined) {
      queryBuilder.andWhere('product.isAvailable = :isAvailable', {
        isAvailable: query.isAvailable,
      });
    }

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
        message: 'Product not found',
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
        message: 'Image not found',
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
        message: 'Image not found',
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
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const existingImageIds = new Set(product.images.map((img) => img.id));
    const invalidIds = imageIds.filter((id) => !existingImageIds.has(id));

    if (invalidIds.length > 0) {
      this.logger.warn(`Invalid image IDs for product ${productId}: ${invalidIds.join(', ')}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Some image IDs do not belong to this product',
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
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock management is only available for physical products',
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
        message: 'Product not found',
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
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock management is only available for physical products',
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
        message: 'Insufficient stock',
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
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock management is only available for physical products',
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
}
