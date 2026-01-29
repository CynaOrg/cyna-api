import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { CategoryService } from '../services';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from '../dto';

@Controller()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * Get all categories (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_CATEGORIES)
  async getCategories(
    @Payload() data: CategoryQueryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.getAll(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get category by slug (public endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_CATEGORY_BY_SLUG)
  async getCategoryBySlug(
    @Payload() data: { slug: string; lang?: Language },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.getBySlug(
        data.slug,
        data.lang || Language.FR,
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get all categories for admin (includes all language fields)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_CATEGORIES_ADMIN)
  async getCategoriesAdmin(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.getAllAdmin();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Get category by ID (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.GET_CATEGORY_BY_ID)
  async getCategoryById(
    @Payload() data: { id: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.getById(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Create a new category (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.CREATE_CATEGORY)
  async createCategory(
    @Payload() data: CreateCategoryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.create(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Update an existing category (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.UPDATE_CATEGORY)
  async updateCategory(
    @Payload() data: { id: string } & UpdateCategoryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { id, ...updateDto } = data;
      const result = await this.categoryService.update(id, updateDto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  /**
   * Delete a category (admin endpoint)
   */
  @MessagePattern(MESSAGE_PATTERNS.CATALOG.DELETE_CATEGORY)
  async deleteCategory(
    @Payload() data: { id: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.categoryService.delete(data.id);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
