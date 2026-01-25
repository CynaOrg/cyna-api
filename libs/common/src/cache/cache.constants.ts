/**
 * Cache Constants
 * Contains constant values used across the cache module
 */

/**
 * Default TTL values in seconds
 */
export const CACHE_TTL = {
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
} as const;

/**
 * Common cache keys
 */
export const CACHE_KEYS = {
  CATEGORIES_LIST: 'categories:list',
  FEATURED_PRODUCTS: 'products:featured',
  CAROUSEL_ITEMS: 'content:carousel',
  FAQ_LIST: 'content:faq',
} as const;
