import { Language, ProductType } from '@cyna-api/common';
import { Product, Category, ProductImage, ProductCharacteristic } from '../entities';

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

    // Primary image
    if (entity.images && entity.images.length > 0) {
      const primaryImage = entity.images.find((img) => img.isPrimary) || entity.images[0];
      if (primaryImage) {
        dto.primaryImage = {
          url: primaryImage.imageUrl,
          altText: lang === Language.EN ? primaryImage.altTextEn : primaryImage.altTextFr,
        };
      }
    }

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

    // Characteristics from relation
    if (entity.characteristics && entity.characteristics.length > 0) {
      dto.characteristics = entity.characteristics
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((char) => ({
          key: lang === Language.EN ? char.keyEn : char.keyFr,
          value: lang === Language.EN ? char.valueEn : char.valueFr,
        }));
    } else {
      dto.characteristics = [];
    }

    // Images from relation
    if (entity.images && entity.images.length > 0) {
      dto.images = entity.images
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((img) => ({
          id: img.id,
          url: img.imageUrl,
          altText: lang === Language.EN ? img.altTextEn : img.altTextFr,
          isPrimary: img.isPrimary,
          displayOrder: img.displayOrder,
        }));
    } else {
      dto.images = [];
    }

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
