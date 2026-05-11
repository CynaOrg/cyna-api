export type FeaturedProductType = 'saas' | 'physical';

export interface TopProductsUpdatedEvent {
  productType: FeaturedProductType;
  added: string[];
  removed: string[];
}
