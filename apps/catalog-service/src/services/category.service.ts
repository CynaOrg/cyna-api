import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { Category } from '../entities';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
  CategoryResponseDto,
  CategoryAdminResponseDto,
} from '../dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('CategoryService');
  }

  /**
   * Get all categories (public endpoint)
   */
  async getAll(query: CategoryQueryDto): Promise<CategoryResponseDto[]> {
    const { lang = Language.FR, activeOnly = true } = query;

    const queryBuilder = this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('category.display_order', 'ASC')
      .addOrderBy('category.created_at', 'ASC');

    if (activeOnly) {
      queryBuilder.where('category.is_active = :isActive', { isActive: true });
    }

    const categories = await queryBuilder.getMany();

    this.logger.log(`Retrieved ${categories.length} categories`);

    return categories.map((cat) => CategoryResponseDto.fromEntity(cat, lang));
  }

  /**
   * Get all categories for admin (includes all language fields)
   */
  async getAllAdmin(): Promise<CategoryAdminResponseDto[]> {
    const categories = await this.categoryRepository.find({
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    this.logger.log(`Retrieved ${categories.length} categories for admin`);

    return categories.map((cat) => CategoryResponseDto.fromEntityAdmin(cat));
  }

  /**
   * Get category by slug (public endpoint)
   */
  async getBySlug(
    slug: string,
    lang: Language = Language.FR,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { slug, isActive: true },
    });

    if (!category) {
      this.logger.warn(`Category not found with slug: ${slug}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    this.logger.log(`Retrieved category by slug: ${slug}`);

    return CategoryResponseDto.fromEntity(category, lang);
  }

  /**
   * Get category by ID (admin endpoint)
   */
  async getById(id: string): Promise<CategoryAdminResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      this.logger.warn(`Category not found with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    this.logger.log(`Retrieved category by ID: ${id}`);

    return CategoryResponseDto.fromEntityAdmin(category);
  }

  /**
   * Create a new category (admin endpoint)
   */
  async create(dto: CreateCategoryDto): Promise<CategoryAdminResponseDto> {
    // Check if slug already exists
    const existingCategory = await this.categoryRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingCategory) {
      this.logger.warn(`Category with slug already exists: ${dto.slug}`);
      throw new RpcException({
        statusCode: 409,
        message: 'Category with this slug already exists',
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

    const savedCategory = await this.categoryRepository.save(category);

    this.logger.log(`Created category: ${savedCategory.slug} (${savedCategory.id})`);

    return CategoryResponseDto.fromEntityAdmin(savedCategory);
  }

  /**
   * Update an existing category (admin endpoint)
   */
  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      this.logger.warn(`Category not found for update with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    // Check if new slug conflicts with existing category
    if (dto.slug && dto.slug !== category.slug) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingCategory) {
        this.logger.warn(`Category with slug already exists: ${dto.slug}`);
        throw new RpcException({
          statusCode: 409,
          message: 'Category with this slug already exists',
          code: 'CATEGORY_SLUG_EXISTS',
        });
      }
    }

    // Update only provided fields
    if (dto.slug !== undefined) category.slug = dto.slug;
    if (dto.nameFr !== undefined) category.nameFr = dto.nameFr;
    if (dto.nameEn !== undefined) category.nameEn = dto.nameEn;
    if (dto.descriptionFr !== undefined) category.descriptionFr = dto.descriptionFr;
    if (dto.descriptionEn !== undefined) category.descriptionEn = dto.descriptionEn;
    if (dto.imageUrl !== undefined) category.imageUrl = dto.imageUrl;
    if (dto.displayOrder !== undefined) category.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    const updatedCategory = await this.categoryRepository.save(category);

    this.logger.log(`Updated category: ${updatedCategory.slug} (${updatedCategory.id})`);

    return CategoryResponseDto.fromEntityAdmin(updatedCategory);
  }

  /**
   * Delete a category (admin endpoint - soft delete)
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      this.logger.warn(`Category not found for deletion with ID: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    // TODO: In Phase 2, check if category has products before deletion
    // const productCount = await this.productRepository.count({ where: { categoryId: id } });
    // if (productCount > 0) {
    //   throw new RpcException({
    //     statusCode: 400,
    //     message: 'Cannot delete category with existing products',
    //     code: 'CATEGORY_HAS_PRODUCTS',
    //   });
    // }

    await this.categoryRepository.softDelete(id);

    this.logger.log(`Deleted category: ${category.slug} (${id})`);

    return {
      success: true,
      message: 'Category deleted successfully',
    };
  }
}
