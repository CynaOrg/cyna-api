import { Product, ProductType } from '../../entities';
import { AdminProductImageDto } from './admin-product-response.dto';

/**
 * Admin product list item DTO - row payload for admin product tables.
 * Exposes both languages and the full image array so the back-office
 * can render thumbnails without secondary calls.
 */
export class AdminProductListItemDto {
  id: string;
  slug: string;
  sku: string;
  nameFr: string;
  nameEn: string;
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
  images: AdminProductImageDto[];
  categoryId: string;
  categorySlug?: string;
  categoryNameFr?: string;
  categoryNameEn?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  static fromEntity(product: Product): AdminProductListItemDto {
    const dto = new AdminProductListItemDto();
    dto.id = product.id;
    dto.slug = product.slug;
    dto.sku = product.sku;
    dto.nameFr = product.nameFr;
    dto.nameEn = product.nameEn;
    dto.shortDescriptionFr = product.shortDescriptionFr;
    dto.shortDescriptionEn = product.shortDescriptionEn;
    dto.productType = product.productType;
    dto.priceMonthly = product.priceMonthly != null ? Number(product.priceMonthly) : undefined;
    dto.priceYearly = product.priceYearly != null ? Number(product.priceYearly) : undefined;
    dto.priceUnit = product.priceUnit != null ? Number(product.priceUnit) : undefined;
    dto.stockQuantity = product.stockQuantity;
    dto.stockAlertThreshold = product.stockAlertThreshold;
    dto.isAvailable = product.isAvailable;
    dto.isFeatured = product.isFeatured;
    dto.displayOrder = product.displayOrder;
    dto.images = product.images
      ? product.images
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((img) => AdminProductImageDto.fromEntity(img))
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

  static fromEntities(products: Product[]): AdminProductListItemDto[] {
    return products.map((product) => AdminProductListItemDto.fromEntity(product));
  }
}

export class PaginatedAdminProductResponseDto {
  data: AdminProductListItemDto[];
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
  ): PaginatedAdminProductResponseDto {
    const dto = new PaginatedAdminProductResponseDto();
    dto.data = AdminProductListItemDto.fromEntities(products);
    dto.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
    return dto;
  }
}
