import { Category } from '../../entities';
import { Language } from '@cyna-api/common';

export class CategoryResponseDto {
  id: string;
  slug: string;
  name: string;
  description?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(category: Category, lang: Language = Language.FR): CategoryResponseDto {
    const dto = new CategoryResponseDto();
    dto.id = category.id;
    dto.slug = category.slug;
    dto.name = lang === Language.EN ? category.nameEn : category.nameFr;
    dto.description = lang === Language.EN ? category.descriptionEn : category.descriptionFr;
    dto.imageUrl = category.imageUrl;
    dto.displayOrder = category.displayOrder;
    dto.isActive = category.isActive;
    dto.productCount = category.products?.length;
    dto.createdAt = category.createdAt;
    dto.updatedAt = category.updatedAt;
    return dto;
  }

  static fromEntities(categories: Category[], lang: Language = Language.FR): CategoryResponseDto[] {
    return categories.map((category) => CategoryResponseDto.fromEntity(category, lang));
  }
}
