import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language, ProductType } from '@cyna-api/common';
import { Product, Category } from '../entities';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  SearchProductDto,
  FeaturedProductsQueryDto,
  UpdateStockDto,
  ProductListResponseDto,
  ProductDetailResponseDto,
  ProductAdminResponseDto,
  PaginatedProductResponseDto,
  StockResponseDto,
} from '../dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('ProductService');
  }

  /**
   * Get all products with filtering and pagination (public endpoint)
   */
  async getAll(query: ProductQueryDto): Promise<PaginatedProductResponseDto> {
    const {
      page = 1,
      limit = 20,
      categorySlug,
      productType,
      isAvailable,
      isFeatured,
      minPrice,
      maxPrice,
      sortBy = 'displayOrder',
      sortOrder = 'asc',
      lang = Language.FR,
    } = query;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .where('product.is_available = :available', { available: true })
      .andWhere('category.is_active = :active', { active: true });

    // Apply filters
    this.applyFilters(queryBuilder, {
      categorySlug,
      productType,
      isAvailable,
      isFeatured,
      minPrice,
      maxPrice,
    });

    // Apply sorting
    const sortColumn = this.getSortColumn(sortBy);
    queryBuilder.orderBy(`product.${sortColumn}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const products = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / limit);

    this.logger.log(`Retrieved ${products.length} products (page ${page}/${totalPages})`);

    return {
      data: products.map((p) =>
        ProductListResponseDto.fromEntity(p, lang, p.category),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get all products for admin (includes all fields)
   */
  async getAllAdmin(query: ProductQueryDto): Promise<PaginatedProductResponseDto> {
    const {
      page = 1,
      limit = 20,
      categorySlug,
      productType,
      isAvailable,
      isFeatured,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');

    // Apply filters (without forcing isAvailable = true)
    this.applyFilters(queryBuilder, {
      categorySlug,
      productType,
      isAvailable,
      isFeatured,
    });

    // Apply sorting
    const sortColumn = this.getSortColumn(sortBy);
    queryBuilder.orderBy(`product.${sortColumn}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const products = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / limit);

    this.logger.log(`Retrieved ${products.length} products for admin (page ${page}/${totalPages})`);

    return {
      data: products.map((p) =>
        ProductAdminResponseDto.fromEntity(p, p.category) as unknown as ProductListResponseDto,
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Search products by name/description (public endpoint)
   */
  async search(query: SearchProductDto): Promise<PaginatedProductResponseDto> {
    const {
      q,
      page = 1,
      limit = 20,
      categorySlug,
      productType,
      lang = Language.FR,
      sortOrder = 'asc',
    } = query;

    const searchTerm = `%${q.toLowerCase()}%`;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .where('product.is_available = :available', { available: true })
      .andWhere('category.is_active = :active', { active: true })
      .andWhere(
        '(LOWER(product.name_fr) LIKE :search OR LOWER(product.name_en) LIKE :search OR LOWER(product.description_fr) LIKE :search OR LOWER(product.description_en) LIKE :search OR LOWER(product.sku) LIKE :search)',
        { search: searchTerm },
      );

    // Apply additional filters
    if (categorySlug) {
      queryBuilder.andWhere('category.slug = :categorySlug', { categorySlug });
    }
    if (productType) {
      queryBuilder.andWhere('product.product_type = :productType', { productType });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);
    queryBuilder.orderBy('product.display_order', sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const products = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / limit);

    this.logger.log(`Search for "${q}" returned ${products.length} products`);

    return {
      data: products.map((p) =>
        ProductListResponseDto.fromEntity(p, lang, p.category),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get featured products (public endpoint)
   */
  async getFeatured(query: FeaturedProductsQueryDto): Promise<ProductListResponseDto[]> {
    const { limit = 8, lang = Language.FR } = query;

    const products = await this.productRepository.find({
      where: {
        isFeatured: true,
        isAvailable: true,
      },
      relations: ['category', 'images'],
      order: { displayOrder: 'ASC' },
      take: limit,
    });

    this.logger.log(`Retrieved ${products.length} featured products`);

    return products
      .filter((p) => p.category?.isActive)
      .map((p) => ProductListResponseDto.fromEntity(p, lang, p.category));
  }

  /**
   * Get product by slug (public endpoint)
   */
  async getBySlug(
    slug: string,
    lang: Language = Language.FR,
  ): Promise<ProductDetailResponseDto> {
    const product = await this.productRepository.findOne({
      where: { slug, isAvailable: true },
      relations: ['category', 'images', 'characteristics'],
    });

    if (!product) {
      this.logger.warn(`Product not found with slug: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (!product.category?.isActive) {
      this.logger.warn(`Product category is inactive: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    this.logger.log(`Retrieved product by slug: ${slug}`);

    return ProductDetailResponseDto.fromEntityDetail(product, lang, product.category);
  }

  /**
   * Get product by ID (admin endpoint)
   */
  async getById(id: string): Promise<ProductAdminResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      this.logger.warn(`Product not found with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    this.logger.log(`Retrieved product by ID: ${id}`);

    return ProductAdminResponseDto.fromEntity(product, product.category);
  }

  /**
   * Create a new product (admin endpoint)
   */
  async create(dto: CreateProductDto): Promise<ProductAdminResponseDto> {
    // Verify category exists
    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId },
    });

    if (!category) {
      this.logger.warn(`Category not found with ID: ${dto.categoryId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    // Check if slug already exists
    const existingSlug = await this.productRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingSlug) {
      this.logger.warn(`Product with slug already exists: ${dto.slug}`);
      throw new RpcException({
        statusCode: 409,
        message: 'Product with this slug already exists',
        code: 'PRODUCT_SLUG_EXISTS',
      });
    }

    // Check if SKU already exists
    const existingSku = await this.productRepository.findOne({
      where: { sku: dto.sku },
    });

    if (existingSku) {
      this.logger.warn(`Product with SKU already exists: ${dto.sku}`);
      throw new RpcException({
        statusCode: 409,
        message: 'Product with this SKU already exists',
        code: 'PRODUCT_SKU_EXISTS',
      });
    }

    // Validate product type specific requirements
    this.validateProductTypeRequirements(dto);

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

    const savedProduct = await this.productRepository.save(product);

    this.logger.log(`Created product: ${savedProduct.slug} (${savedProduct.id})`);

    // TODO: Emit product.created event for analytics

    return ProductAdminResponseDto.fromEntity(savedProduct, category);
  }

  /**
   * Update an existing product (admin endpoint)
   */
  async update(id: string, dto: UpdateProductDto): Promise<ProductAdminResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!product) {
      this.logger.warn(`Product not found for update with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // Check category if being changed
    let category: Category | undefined = product.category;
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const newCategory = await this.categoryRepository.findOne({
        where: { id: dto.categoryId },
      });

      if (!newCategory) {
        this.logger.warn(`Category not found with ID: ${dto.categoryId}`);
        throw new RpcException({
          statusCode: 404,
          message: 'Category not found',
          code: 'CATEGORY_NOT_FOUND',
        });
      }
      category = newCategory;
    }

    // Check slug uniqueness if being changed
    if (dto.slug && dto.slug !== product.slug) {
      const existingSlug = await this.productRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingSlug) {
        this.logger.warn(`Product with slug already exists: ${dto.slug}`);
        throw new RpcException({
          statusCode: 409,
          message: 'Product with this slug already exists',
          code: 'PRODUCT_SLUG_EXISTS',
        });
      }
    }

    // Check SKU uniqueness if being changed
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.productRepository.findOne({
        where: { sku: dto.sku },
      });

      if (existingSku) {
        this.logger.warn(`Product with SKU already exists: ${dto.sku}`);
        throw new RpcException({
          statusCode: 409,
          message: 'Product with this SKU already exists',
          code: 'PRODUCT_SKU_EXISTS',
        });
      }
    }

    // Update only provided fields
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;
    if (dto.slug !== undefined) product.slug = dto.slug;
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.nameFr !== undefined) product.nameFr = dto.nameFr;
    if (dto.nameEn !== undefined) product.nameEn = dto.nameEn;
    if (dto.descriptionFr !== undefined) product.descriptionFr = dto.descriptionFr;
    if (dto.descriptionEn !== undefined) product.descriptionEn = dto.descriptionEn;
    if (dto.shortDescriptionFr !== undefined) product.shortDescriptionFr = dto.shortDescriptionFr;
    if (dto.shortDescriptionEn !== undefined) product.shortDescriptionEn = dto.shortDescriptionEn;
    if (dto.priceMonthly !== undefined) product.priceMonthly = dto.priceMonthly;
    if (dto.priceYearly !== undefined) product.priceYearly = dto.priceYearly;
    if (dto.priceUnit !== undefined) product.priceUnit = dto.priceUnit;
    if (dto.stockAlertThreshold !== undefined) product.stockAlertThreshold = dto.stockAlertThreshold;
    if (dto.isAvailable !== undefined) product.isAvailable = dto.isAvailable;
    if (dto.isFeatured !== undefined) product.isFeatured = dto.isFeatured;
    if (dto.displayOrder !== undefined) product.displayOrder = dto.displayOrder;
    if (dto.stripeProductId !== undefined) product.stripeProductId = dto.stripeProductId;
    if (dto.stripePriceIdMonthly !== undefined) product.stripePriceIdMonthly = dto.stripePriceIdMonthly;
    if (dto.stripePriceIdYearly !== undefined) product.stripePriceIdYearly = dto.stripePriceIdYearly;
    if (dto.stripePriceIdUnit !== undefined) product.stripePriceIdUnit = dto.stripePriceIdUnit;

    const updatedProduct = await this.productRepository.save(product);

    this.logger.log(`Updated product: ${updatedProduct.slug} (${updatedProduct.id})`);

    // TODO: Emit product.updated event for analytics

    return ProductAdminResponseDto.fromEntity(updatedProduct, category);
  }

  /**
   * Update stock for a physical product (admin endpoint)
   */
  async updateStock(id: string, dto: UpdateStockDto): Promise<StockResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      this.logger.warn(`Product not found for stock update with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Cannot update stock for non-physical product: ${id}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock can only be updated for physical products',
        code: 'INVALID_PRODUCT_TYPE',
      });
    }

    const previousStock = product.stockQuantity || 0;
    product.stockQuantity = dto.stockQuantity;
    if (dto.stockAlertThreshold !== undefined) {
      product.stockAlertThreshold = dto.stockAlertThreshold;
    }

    await this.productRepository.save(product);

    this.logger.log(
      `Updated stock for product ${product.sku}: ${previousStock} -> ${dto.stockQuantity}`,
    );

    // TODO: In Phase 4, check for low stock and emit stock.low event

    return this.getStockResponse(product, 0);
  }

  /**
   * Get stock information for a product
   */
  async getStock(productId: string): Promise<StockResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found for stock check with ID: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock check requested for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock is only available for physical products',
        code: 'INVALID_PRODUCT_TYPE',
      });
    }

    // TODO: In Phase 4, calculate reserved quantity from stock_reservations table
    const reservedQuantity = 0;

    return this.getStockResponse(product, reservedQuantity);
  }

  /**
   * Delete a product (admin endpoint - soft delete)
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      this.logger.warn(`Product not found for deletion with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // TODO: Check for active subscriptions/orders before deletion

    await this.productRepository.softDelete(id);

    this.logger.log(`Deleted product: ${product.slug} (${id})`);

    // TODO: Emit product.deleted event for analytics

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  // ==================== Private Helper Methods ====================

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    filters: {
      categorySlug?: string;
      productType?: ProductType;
      isAvailable?: boolean;
      isFeatured?: boolean;
      minPrice?: number;
      maxPrice?: number;
    },
  ): void {
    if (filters.categorySlug) {
      queryBuilder.andWhere('category.slug = :categorySlug', {
        categorySlug: filters.categorySlug,
      });
    }

    if (filters.productType) {
      queryBuilder.andWhere('product.product_type = :productType', {
        productType: filters.productType,
      });
    }

    if (filters.isAvailable !== undefined) {
      queryBuilder.andWhere('product.is_available = :isAvailable', {
        isAvailable: filters.isAvailable,
      });
    }

    if (filters.isFeatured !== undefined) {
      queryBuilder.andWhere('product.is_featured = :isFeatured', {
        isFeatured: filters.isFeatured,
      });
    }

    if (filters.minPrice !== undefined) {
      queryBuilder.andWhere(
        '(product.price_monthly >= :minPrice OR product.price_yearly >= :minPrice OR product.price_unit >= :minPrice)',
        { minPrice: filters.minPrice },
      );
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere(
        '(product.price_monthly <= :maxPrice OR product.price_yearly <= :maxPrice OR product.price_unit <= :maxPrice)',
        { maxPrice: filters.maxPrice },
      );
    }
  }

  private getSortColumn(sortBy: string): string {
    const sortMap: Record<string, string> = {
      displayOrder: 'display_order',
      priceMonthly: 'price_monthly',
      priceUnit: 'price_unit',
      createdAt: 'created_at',
      nameFr: 'name_fr',
      nameEn: 'name_en',
    };
    return sortMap[sortBy] || 'display_order';
  }

  private validateProductTypeRequirements(dto: CreateProductDto): void {
    switch (dto.productType) {
      case ProductType.SAAS:
        if (!dto.priceMonthly && !dto.priceYearly) {
          throw new RpcException({
            statusCode: 400,
            message: 'SaaS products require at least one of priceMonthly or priceYearly',
            code: 'INVALID_SAAS_PRICING',
          });
        }
        break;

      case ProductType.DIGITAL:
        if (!dto.priceUnit) {
          throw new RpcException({
            statusCode: 400,
            message: 'Digital products require priceUnit',
            code: 'INVALID_DIGITAL_PRICING',
          });
        }
        break;

      case ProductType.PHYSICAL:
        if (!dto.priceUnit) {
          throw new RpcException({
            statusCode: 400,
            message: 'Physical products require priceUnit',
            code: 'INVALID_PHYSICAL_PRICING',
          });
        }
        if (dto.stockQuantity === undefined || dto.stockQuantity === null) {
          throw new RpcException({
            statusCode: 400,
            message: 'Physical products require stockQuantity',
            code: 'INVALID_PHYSICAL_STOCK',
          });
        }
        break;
    }
  }

  private getStockResponse(product: Product, reservedQuantity: number): StockResponseDto {
    const stockQuantity = product.stockQuantity || 0;
    const availableQuantity = stockQuantity - reservedQuantity;

    let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
    if (availableQuantity <= 0) {
      stockStatus = 'out_of_stock';
    } else if (availableQuantity <= product.stockAlertThreshold) {
      stockStatus = 'low_stock';
    } else {
      stockStatus = 'in_stock';
    }

    return {
      productId: product.id,
      sku: product.sku,
      productType: product.productType,
      stockQuantity,
      reservedQuantity,
      availableQuantity: Math.max(0, availableQuantity),
      stockAlertThreshold: product.stockAlertThreshold,
      stockStatus,
      isAvailable: product.isAvailable && availableQuantity > 0,
    };
  }
}
