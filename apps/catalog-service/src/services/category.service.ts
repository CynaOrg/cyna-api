import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { Category } from '../entities';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from '../dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly logger: CynaLoggerService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existingCategory = await this.categoryRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingCategory) {
      this.logger.warn(`Category slug already exists: ${dto.slug}`);
      throw new RpcException({
        statusCode: 409,
        message: 'Category slug already exists',
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

    return category;
  }

  async findAll(query: CategoryQueryDto): Promise<Category[]> {
    const queryBuilder = this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.products', 'product')
      .addSelect('COUNT(product.id)', 'productCount')
      .groupBy('category.id')
      .orderBy('category.displayOrder', 'ASC');

    if (query.isActive !== undefined) {
      queryBuilder.where('category.isActive = :isActive', { isActive: query.isActive });
    }

    const categories = await queryBuilder.getMany();
    return categories;
  }

  async findBySlug(slug: string): Promise<Category> {
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
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    return category;
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      this.logger.warn(`Category not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (dto.slug && dto.slug !== category.slug) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingCategory) {
        this.logger.warn(`Category slug already exists: ${dto.slug}`);
        throw new RpcException({
          statusCode: 409,
          message: 'Category slug already exists',
          code: 'CATEGORY_SLUG_EXISTS',
        });
      }
    }

    Object.assign(category, dto);
    await this.categoryRepository.save(category);

    this.logger.log(`Category updated: ${category.id} (${category.slug})`);
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
        message: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    if (category.products && category.products.length > 0) {
      this.logger.warn(`Cannot delete category with products: ${id}`);
      throw new RpcException({
        statusCode: 409,
        message: 'Cannot delete category with associated products',
        code: 'CATEGORY_HAS_PRODUCTS',
      });
    }

    await this.categoryRepository.remove(category);
    this.logger.log(`Category deleted: ${id}`);
  }
}
