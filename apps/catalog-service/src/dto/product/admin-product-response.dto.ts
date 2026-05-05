import {
  Product,
  ProductType,
  ProductImage,
  ProductCharacteristic,
} from '../../entities';

/**
 * Admin product image DTO - exposes both FR and EN alt texts so the
 * back-office can edit either language without an extra round-trip.
 */
export class AdminProductImageDto {
  id: string;
  imageUrl: string;
  altTextFr?: string;
  altTextEn?: string;
  displayOrder: number;
  isPrimary: boolean;

  static fromEntity(image: ProductImage): AdminProductImageDto {
    const dto = new AdminProductImageDto();
    dto.id = image.id;
    dto.imageUrl = image.imageUrl;
    dto.altTextFr = image.altTextFr;
    dto.altTextEn = image.altTextEn;
    dto.displayOrder = image.displayOrder;
    dto.isPrimary = image.isPrimary;
    return dto;
  }
}

/**
 * Admin product characteristic DTO - exposes both FR and EN strings.
 */
export class AdminProductCharacteristicDto {
  id: string;
  keyFr: string;
  keyEn: string;
  valueFr: string;
  valueEn: string;
  displayOrder: number;

  static fromEntity(characteristic: ProductCharacteristic): AdminProductCharacteristicDto {
    const dto = new AdminProductCharacteristicDto();
    dto.id = characteristic.id;
    dto.keyFr = characteristic.keyFr;
    dto.keyEn = characteristic.keyEn;
    dto.valueFr = characteristic.valueFr;
    dto.valueEn = characteristic.valueEn;
    dto.displayOrder = characteristic.displayOrder;
    return dto;
  }
}

/**
 * Admin product detail DTO - full bilingual payload + complete images array.
 * Used by:
 * - admin GET /admin/catalog/products/:id
 * - admin POST /admin/catalog/products (create response)
 * - admin PATCH /admin/catalog/products/:id (update response)
 * so the back-office can refresh state from the response without an extra
 * GET (PROD-15).
 */
export class AdminProductResponseDto {
  id: string;
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
  images: AdminProductImageDto[];
  characteristics: AdminProductCharacteristicDto[];
  categoryId: string;
  categorySlug?: string;
  categoryNameFr?: string;
  categoryNameEn?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  static fromEntity(product: Product): AdminProductResponseDto {
    const dto = new AdminProductResponseDto();
    dto.id = product.id;
    dto.slug = product.slug;
    dto.sku = product.sku;
    dto.nameFr = product.nameFr;
    dto.nameEn = product.nameEn;
    dto.descriptionFr = product.descriptionFr;
    dto.descriptionEn = product.descriptionEn;
    dto.shortDescriptionFr = product.shortDescriptionFr;
    dto.shortDescriptionEn = product.shortDescriptionEn;
    dto.productType = product.productType;
    dto.priceMonthly = product.priceMonthly ? Number(product.priceMonthly) : undefined;
    dto.priceYearly = product.priceYearly ? Number(product.priceYearly) : undefined;
    dto.priceUnit = product.priceUnit ? Number(product.priceUnit) : undefined;
    dto.stockQuantity = product.stockQuantity;
    dto.stockAlertThreshold = product.stockAlertThreshold;
    dto.isAvailable = product.isAvailable;
    dto.isFeatured = product.isFeatured;
    dto.displayOrder = product.displayOrder;
    dto.stripeProductId = product.stripeProductId;
    dto.stripePriceIdMonthly = product.stripePriceIdMonthly;
    dto.stripePriceIdYearly = product.stripePriceIdYearly;
    dto.stripePriceIdUnit = product.stripePriceIdUnit;
    dto.images = product.images
      ? product.images
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((img) => AdminProductImageDto.fromEntity(img))
      : [];
    dto.characteristics = product.characteristics
      ? product.characteristics
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((char) => AdminProductCharacteristicDto.fromEntity(char))
      : [];
    dto.categoryId = product.categoryId;
    dto.categorySlug = product.category?.slug;
    dto.categoryNameFr = product.category?.nameFr;
    dto.categoryNameEn = product.category?.nameEn;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;
    dto.deletedAt = product.deletedAt;
    return dto;
  }
}
