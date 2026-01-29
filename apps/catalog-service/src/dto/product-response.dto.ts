import { Language, ProductType } from '@cyna-api/common';
import { Product } from '../entities';
import { Category } from '../entities';

/**
 * Product List Response DTO (for catalog listings)
 * Includes localized content and category info
 */
export class ProductListResponseDto {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription?: string;
  productType: ProductType;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  category: {
    id: string;
    slug: string;
    name: string;
  };
  primaryImage?: {
    url: string;
    altText?: string;
  };
  createdAt: Date;

  static fromEntity(
    entity: Product,
    lang: Language = Language.FR,
    category?: Category,
  ): ProductListResponseDto {
    const dto = new ProductListResponseDto();
    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.sku = entity.sku;
    dto.name = lang === Language.EN ? entity.nameEn : entity.nameFr;
    dto.shortDescription =
      lang === Language.EN ? entity.shortDescriptionEn : entity.shortDescriptionFr;
    dto.productType = entity.productType;
    dto.priceMonthly = entity.priceMonthly ? Number(entity.priceMonthly) : undefined;
    dto.priceYearly = entity.priceYearly ? Number(entity.priceYearly) : undefined;
    dto.priceUnit = entity.priceUnit ? Number(entity.priceUnit) : undefined;
    dto.isAvailable = entity.isAvailable;
    dto.isFeatured = entity.isFeatured;
    dto.displayOrder = entity.displayOrder;
    dto.createdAt = entity.createdAt;

    // Category info
    const cat = category || entity.category;
    if (cat) {
      dto.category = {
        id: cat.id,
        slug: cat.slug,
        name: lang === Language.EN ? cat.nameEn : cat.nameFr,
      };
    }

    // Primary image will be added in Phase 3
    // dto.primaryImage = ...

    return dto;
  }
}

/**
 * Product Detail Response DTO (for product detail page)
 * Includes full description, stock info, characteristics, images
 */
export class ProductDetailResponseDto extends ProductListResponseDto {
  description: string;
  stockQuantity?: number;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  characteristics: {
    key: string;
    value: string;
  }[];
  images: {
    id: string;
    url: string;
    altText?: string;
    isPrimary: boolean;
    displayOrder: number;
  }[];

  static fromEntityDetail(
    entity: Product,
    lang: Language = Language.FR,
    category?: Category,
  ): ProductDetailResponseDto {
    const dto = new ProductDetailResponseDto();

    // Copy base fields
    Object.assign(dto, ProductListResponseDto.fromEntity(entity, lang, category));

    // Add detail fields
    dto.description = lang === Language.EN ? entity.descriptionEn : entity.descriptionFr;

    // Stock info for physical products
    if (entity.productType === ProductType.PHYSICAL && entity.stockQuantity !== null) {
      dto.stockQuantity = entity.stockQuantity;
      dto.stockStatus = getStockStatus(entity.stockQuantity, entity.stockAlertThreshold);
    }

    // Characteristics will be populated from relation in Phase 3
    dto.characteristics = [];

    // Images will be populated from relation in Phase 3
    dto.images = [];

    return dto;
  }
}

/**
 * Admin Product Response DTO (includes all language fields)
 */
export class ProductAdminResponseDto {
  id: string;
  categoryId: string;
  slug: string;
  sku: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  shortDescriptionFr?: string;
  shortDescriptionEn?: string;
  productType: ProductType;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  stockQuantity?: number;
  stockAlertThreshold: number;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  stripeProductId?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  stripePriceIdUnit?: string;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    slug: string;
    nameFr: string;
    nameEn: string;
  };

  static fromEntity(entity: Product, category?: Category): ProductAdminResponseDto {
    const dto = new ProductAdminResponseDto();
    dto.id = entity.id;
    dto.categoryId = entity.categoryId;
    dto.slug = entity.slug;
    dto.sku = entity.sku;
    dto.nameFr = entity.nameFr;
    dto.nameEn = entity.nameEn;
    dto.descriptionFr = entity.descriptionFr;
    dto.descriptionEn = entity.descriptionEn;
    dto.shortDescriptionFr = entity.shortDescriptionFr;
    dto.shortDescriptionEn = entity.shortDescriptionEn;
    dto.productType = entity.productType;
    dto.priceMonthly = entity.priceMonthly ? Number(entity.priceMonthly) : undefined;
    dto.priceYearly = entity.priceYearly ? Number(entity.priceYearly) : undefined;
    dto.priceUnit = entity.priceUnit ? Number(entity.priceUnit) : undefined;
    dto.stockQuantity = entity.stockQuantity ?? undefined;
    dto.stockAlertThreshold = entity.stockAlertThreshold;
    dto.isAvailable = entity.isAvailable;
    dto.isFeatured = entity.isFeatured;
    dto.displayOrder = entity.displayOrder;
    dto.stripeProductId = entity.stripeProductId;
    dto.stripePriceIdMonthly = entity.stripePriceIdMonthly;
    dto.stripePriceIdYearly = entity.stripePriceIdYearly;
    dto.stripePriceIdUnit = entity.stripePriceIdUnit;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;

    const cat = category || entity.category;
    if (cat) {
      dto.category = {
        id: cat.id,
        slug: cat.slug,
        nameFr: cat.nameFr,
        nameEn: cat.nameEn,
      };
    }

    return dto;
  }
}

/**
 * Paginated Product Response DTO
 */
export class PaginatedProductResponseDto {
  data: ProductListResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Stock Response DTO
 */
export class StockResponseDto {
  productId: string;
  sku: string;
  productType: ProductType;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  stockAlertThreshold: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  isAvailable: boolean;
}

/**
 * Helper function to determine stock status
 */
function getStockStatus(
  quantity: number | null | undefined,
  threshold: number,
): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (quantity === null || quantity === undefined || quantity <= 0) {
    return 'out_of_stock';
  }
  if (quantity <= threshold) {
    return 'low_stock';
  }
  return 'in_stock';
}
