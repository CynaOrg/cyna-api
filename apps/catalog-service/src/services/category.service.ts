import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_TTL,
  CACHE_KEYS,
  generateCacheKey,
  CACHE_PREFIXES,
} from '@cyna-api/common';
import { Category } from '../entities';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from '../dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existingCategory = await this.categoryRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingCategory) {
      this.logger.warn(`Category slug already exists: ${dto.slug}`);
      throw new RpcException({
        statusCode: 409,
        message: 'errors.catalog.slugExists',
        code: 'CATEGORY_SLUG_EXISTS',
      });
    }

    const category = this.categoryRepository.create({
      slug: dto.slug,
      nameFr: dto.nameFr,
      nameEn: dto.nameEn,
      descriptionFr: dto.descriptionFr,
      descriptionEn: dto.descriptionEn,
      imageUrl: dto.imageUrl,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await this.categoryRepository.save(category);
    this.logger.log(`Category created: ${category.id} (${category.slug})`);

    // Invalidate category list cache
    await this.invalidateCategoryCache();

    return category;
  }

  async findAll(query: CategoryQueryDto): Promise<Category[]> {
    // Generate cache key based on query
    const cacheKey =
      query.isActive === true
        ? CACHE_KEYS.CATEGORIES_ACTIVE
        : query.isActive === false
          ? `${CACHE_KEYS.CATEGORIES_LIST}:inactive`
          : CACHE_KEYS.CATEGORIES_LIST;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const queryBuilder = this.categoryRepository
          .createQueryBuilder('category')
          .leftJoin('category.products', 'product')
          .addSelect('COUNT(product.id)', 'productCount')
          .groupBy('category.id')
          .orderBy('category.displayOrder', 'ASC');

        if (query.isActive !== undefined) {
          queryBuilder.where('category.isActive = :isActive', { isActive: query.isActive });
        }

        return queryBuilder.getMany();
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findBySlug(slug: string): Promise<Category> {
    const cacheKey = generateCacheKey.category(slug);

    const cachedCategory = await this.cacheService.get<Category>(cacheKey);
    if (cachedCategory) {
      return cachedCategory;
    }

    const category = await this.categoryRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.products', 'product', 'product.isAvailable = :isAvailable', {
        isAvailable: true,
      })
      .where('category.slug = :slug', { slug })
      .getOne();

    if (!category) {
      this.logger.warn(`Category not found: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.categoryNotFound',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    // Cache the result
    await this.cacheService.set(cacheKey, category, CACHE_TTL.MEDIUM);

    return category;
  }

  async findById(id: string): Promise<Category> {
    const cacheKey = generateCacheKey.categoryById(id);

    const cachedCategory = await this.cacheService.get<Category>(cacheKey);
    if (cachedCategory) {
      return cachedCategory;
    }

    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      this.logger.warn(`Category not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.categoryNotFound',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    // Cache the result
    await this.cacheService.set(cacheKey, category, CACHE_TTL.MEDIUM);

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    // Fetch directly from DB to get current state (bypass cache for update)
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      this.logger.warn(`Category not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.categoryNotFound',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const oldSlug = category.slug;

    if (dto.slug && dto.slug !== category.slug) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingCategory) {
        this.logger.warn(`Category slug already exists: ${dto.slug}`);
        throw new RpcException({
          statusCode: 409,
          message: 'errors.catalog.slugExists',
          code: 'CATEGORY_SLUG_EXISTS',
        });
      }
    }

    Object.assign(category, dto);
    await this.categoryRepository.save(category);

    this.logger.log(`Category updated: ${category.id} (${category.slug})`);

    // Invalidate cache for this category and lists
    await this.invalidateCategoryCache(id, oldSlug);
    if (dto.slug && dto.slug !== oldSlug) {
      await this.cacheService.del(generateCacheKey.category(dto.slug));
    }

    return category;
  }

  async delete(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['products'],
    });

    if (!category) {
      this.logger.warn(`Category not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.categoryNotFound',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    if (category.products && category.products.length > 0) {
      this.logger.warn(`Cannot delete category with products: ${id}`);
      throw new RpcException({
        statusCode: 409,
        message: 'errors.catalog.categoryHasProducts',
        code: 'CATEGORY_HAS_PRODUCTS',
      });
    }

    const slug = category.slug;
    await this.categoryRepository.remove(category);
    this.logger.log(`Category deleted: ${id}`);

    // Invalidate cache
    await this.invalidateCategoryCache(id, slug);
  }

  async reorder(categoryIds: string[]): Promise<Category[]> {
    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds) },
    });

    if (categories.length !== categoryIds.length) {
      this.logger.warn(`Some category IDs not found during reorder`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.invalidCategoryIds',
        code: 'CATEGORY_INVALID_IDS',
      });
    }

    for (let i = 0; i < categoryIds.length; i++) {
      const category = categories.find((c) => c.id === categoryIds[i]);
      if (category) {
        category.displayOrder = i;
      }
    }

    await this.categoryRepository.save(categories);
    this.logger.log(`Categories reordered: ${categoryIds.length} categories`);

    await this.invalidateCategoryCache();

    return this.categoryRepository.find({
      order: { displayOrder: 'ASC' },
    });
  }

  /**
   * Invalidate category cache
   * @param id Category ID (optional)
   * @param slug Category slug (optional)
   */
  private async invalidateCategoryCache(id?: string, slug?: string): Promise<void> {
    // Always invalidate list caches
    await this.cacheService.del(CACHE_KEYS.CATEGORIES_LIST);
    await this.cacheService.del(CACHE_KEYS.CATEGORIES_ACTIVE);
    await this.cacheService.del(`${CACHE_KEYS.CATEGORIES_LIST}:inactive`);

    // Invalidate specific category caches if ID or slug provided
    if (id) {
      await this.cacheService.del(generateCacheKey.categoryById(id));
    }
    if (slug) {
      await this.cacheService.del(generateCacheKey.category(slug));
    }

    // Invalidate all category-prefixed keys
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.CATEGORY}*`);
  }
}
