export type FeaturedProductType = 'saas' | 'physical' | 'license';

export interface TopProductsUpdatedEvent {
  productType: FeaturedProductType;
  added: string[];
  removed: string[];
}
