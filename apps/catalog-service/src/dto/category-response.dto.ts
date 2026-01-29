import { Language } from '@cyna-api/common';
import { Category } from '../entities';

/**
 * Category Response DTO
 * Returns localized category data based on requested language
 */
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

  /**
   * Create response DTO from entity with localization
   */
  static fromEntity(
    entity: Category,
    lang: Language = Language.FR,
  ): CategoryResponseDto {
    const dto = new CategoryResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.name = lang === Language.EN ? entity.nameEn : entity.nameFr;
    dto.description =
      lang === Language.EN ? entity.descriptionEn : entity.descriptionFr;
    dto.imageUrl = entity.imageUrl;
    dto.displayOrder = entity.displayOrder;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  /**
   * Create response DTO from entity for admin (includes all language fields)
   */
  static fromEntityAdmin(entity: Category): CategoryAdminResponseDto {
    const dto = new CategoryAdminResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.nameFr = entity.nameFr;
    dto.nameEn = entity.nameEn;
    dto.descriptionFr = entity.descriptionFr;
    dto.descriptionEn = entity.descriptionEn;
    dto.imageUrl = entity.imageUrl;
    dto.displayOrder = entity.displayOrder;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

/**
 * Admin Category Response DTO
 * Returns all language fields for admin management
 */
export class CategoryAdminResponseDto {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  descriptionFr?: string;
  descriptionEn?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
