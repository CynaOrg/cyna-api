/**
 * Cache Constants
 * Contains constant values used across the cache module
 */

/**
 * Default TTL values in seconds
 */
export const CACHE_TTL = {
  /** Very short-lived cache (1 minute) - for highly dynamic data */
  VERY_SHORT: 60,
  /** Short-lived cache (5 minutes) - for frequently changing data */
  SHORT: 300,
  /** Medium-lived cache (1 hour) - default */
  MEDIUM: 3600,
  /** Long-lived cache (24 hours) - for rarely changing data */
  LONG: 86400,
  /** Session cache (30 minutes) */
  SESSION: 1800,
} as const;

/**
 * Cache key prefixes for different domains
 * Helps organize and namespace cache keys
 */
export const CACHE_PREFIXES = {
  USER: 'user:',
  SESSION: 'session:',
  PRODUCT: 'product:',
  CATEGORY: 'category:',
  CART: 'cart:',
  ORDER: 'order:',
  CONTENT: 'content:',
  CONFIG: 'config:',
  SEARCH: 'search:',
  STOCK: 'stock:',
} as const;

/**
 * Common cache keys
 */
export const CACHE_KEYS = {
  // Categories
  CATEGORIES_LIST: 'category:list',
  CATEGORIES_ACTIVE: 'category:list:active',

  // Products
  PRODUCTS_LIST: 'product:list',
  PRODUCTS_FEATURED: 'product:featured',
  PRODUCTS_BY_CATEGORY: 'product:category:',

  // Content
  CAROUSEL_ITEMS: 'content:carousel',
  FAQ_LIST: 'content:faq',
  TOP_SERVICES: 'content:top-services',
  TOP_PRODUCTS: 'content:top-products',
  HOMEPAGE: 'content:homepage',

  // Stock
  STOCK_ALERTS: 'stock:alerts',
} as const;

/**
 * Helper function to generate cache keys
 */
export const generateCacheKey = {
  product: (slug: string) => `${CACHE_PREFIXES.PRODUCT}${slug}`,
  productById: (id: string) => `${CACHE_PREFIXES.PRODUCT}id:${id}`,
  productList: (hash: string) => `${CACHE_PREFIXES.PRODUCT}list:${hash}`,
  productsByCategory: (categoryId: string) => `${CACHE_KEYS.PRODUCTS_BY_CATEGORY}${categoryId}`,

  category: (slug: string) => `${CACHE_PREFIXES.CATEGORY}${slug}`,
  categoryById: (id: string) => `${CACHE_PREFIXES.CATEGORY}id:${id}`,

  search: (term: string, hash: string) => `${CACHE_PREFIXES.SEARCH}${term}:${hash}`,
};
