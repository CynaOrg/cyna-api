/**
 * Gateway-side response shapes for admin product endpoints.
 *
 * These mirror the catalog-service `AdminProductResponseDto` /
 * `PaginatedAdminProductResponseDto` so the gateway can type the
 * RPC return value without importing the microservice's internal DTOs
 * across the service boundary.
 */

export type ProductTypeLiteral = 'saas' | 'physical' | 'license';

export interface AdminProductImageResponse {
  id: string;
  imageUrl: string;
  altTextFr?: string;
  altTextEn?: string;
  displayOrder: number;
  isPrimary: boolean;
}

export interface AdminProductCharacteristicResponse {
  id: string;
  keyFr: string;
  keyEn: string;
  valueFr: string;
  valueEn: string;
  displayOrder: number;
}

export interface AdminProductResponse {
  id: string;
  slug: string;
  sku: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  shortDescriptionFr?: string;
  shortDescriptionEn?: string;
  productType: ProductTypeLiteral;
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
  images: AdminProductImageResponse[];
  characteristics: AdminProductCharacteristicResponse[];
  categoryId: string;
  categorySlug?: string;
  categoryNameFr?: string;
  categoryNameEn?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date;
}

export interface AdminProductListItemResponse {
  id: string;
  slug: string;
  sku: string;
  nameFr: string;
  nameEn: string;
  shortDescriptionFr?: string;
  shortDescriptionEn?: string;
  productType: ProductTypeLiteral;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  stockQuantity?: number;
  stockAlertThreshold: number;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  images: AdminProductImageResponse[];
  categoryId: string;
  categorySlug?: string;
  categoryNameFr?: string;
  categoryNameEn?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date;
}

export interface PaginatedAdminProductResponse {
  data: AdminProductListItemResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
