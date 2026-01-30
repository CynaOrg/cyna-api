import { Language } from '@cyna-api/common';
import { Product, ProductType, ProductImage, ProductCharacteristic } from '../../entities';

export class ProductImageResponseDto {
  id: string;
  imageUrl: string;
  altText?: string;
  displayOrder: number;
  isPrimary: boolean;

  static fromEntity(image: ProductImage, lang: Language = Language.FR): ProductImageResponseDto {
    const dto = new ProductImageResponseDto();
    dto.id = image.id;
    dto.imageUrl = image.imageUrl;
    dto.altText = lang === Language.EN ? image.altTextEn : image.altTextFr;
    dto.displayOrder = image.displayOrder;
    dto.isPrimary = image.isPrimary;
    return dto;
  }
}

export class ProductCharacteristicResponseDto {
  id: string;
  key: string;
  value: string;
  displayOrder: number;

  static fromEntity(
    characteristic: ProductCharacteristic,
    lang: Language = Language.FR,
  ): ProductCharacteristicResponseDto {
    const dto = new ProductCharacteristicResponseDto();
    dto.id = characteristic.id;
    dto.key = lang === Language.EN ? characteristic.keyEn : characteristic.keyFr;
    dto.value = lang === Language.EN ? characteristic.valueEn : characteristic.valueFr;
    dto.displayOrder = characteristic.displayOrder;
    return dto;
  }
}

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
  primaryImageUrl?: string;
  categorySlug?: string;
  categoryName?: string;

  static fromEntity(product: Product, lang: Language = Language.FR): ProductListResponseDto {
    const dto = new ProductListResponseDto();
    dto.id = product.id;
    dto.slug = product.slug;
    dto.sku = product.sku;
    dto.name = lang === Language.EN ? product.nameEn : product.nameFr;
    dto.shortDescription =
      lang === Language.EN ? product.shortDescriptionEn : product.shortDescriptionFr;
    dto.productType = product.productType;
    dto.priceMonthly = product.priceMonthly ? Number(product.priceMonthly) : undefined;
    dto.priceYearly = product.priceYearly ? Number(product.priceYearly) : undefined;
    dto.priceUnit = product.priceUnit ? Number(product.priceUnit) : undefined;
    dto.isAvailable = product.isAvailable;
    dto.isFeatured = product.isFeatured;
    dto.displayOrder = product.displayOrder;
    dto.primaryImageUrl = product.images?.find((img) => img.isPrimary)?.imageUrl;
    dto.categorySlug = product.category?.slug;
    dto.categoryName = product.category
      ? lang === Language.EN
        ? product.category.nameEn
        : product.category.nameFr
      : undefined;
    return dto;
  }

  static fromEntities(products: Product[], lang: Language = Language.FR): ProductListResponseDto[] {
    return products.map((product) => ProductListResponseDto.fromEntity(product, lang));
  }
}

export class ProductDetailResponseDto {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string;
  shortDescription?: string;
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
  images: ProductImageResponseDto[];
  characteristics: ProductCharacteristicResponseDto[];
  categoryId: string;
  categorySlug?: string;
  categoryName?: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(product: Product, lang: Language = Language.FR): ProductDetailResponseDto {
    const dto = new ProductDetailResponseDto();
    dto.id = product.id;
    dto.slug = product.slug;
    dto.sku = product.sku;
    dto.name = lang === Language.EN ? product.nameEn : product.nameFr;
    dto.description = lang === Language.EN ? product.descriptionEn : product.descriptionFr;
    dto.shortDescription =
      lang === Language.EN ? product.shortDescriptionEn : product.shortDescriptionFr;
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
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((img) => ProductImageResponseDto.fromEntity(img, lang))
      : [];
    dto.characteristics = product.characteristics
      ? product.characteristics
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((char) => ProductCharacteristicResponseDto.fromEntity(char, lang))
      : [];
    dto.categoryId = product.categoryId;
    dto.categorySlug = product.category?.slug;
    dto.categoryName = product.category
      ? lang === Language.EN
        ? product.category.nameEn
        : product.category.nameFr
      : undefined;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;
    return dto;
  }
}

export class PaginatedProductResponseDto {
  data: ProductListResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  static create(
    products: Product[],
    total: number,
    page: number,
    limit: number,
    lang: Language = Language.FR,
  ): PaginatedProductResponseDto {
    const dto = new PaginatedProductResponseDto();
    dto.data = ProductListResponseDto.fromEntities(products, lang);
    dto.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
    return dto;
  }
}
