import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingPeriod } from '@cyna-api/common';

// ==================== Interfaces ====================

export interface SeedCategoryDto {
  slug?: string;
  nameFr?: string;
  nameEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface SeedProductDto {
  slug?: string;
  sku?: string;
  nameFr?: string;
  nameEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  shortDescriptionFr?: string;
  shortDescriptionEn?: string;
  productType?: string;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  stockQuantity?: number;
  stockAlertThreshold?: number;
  isAvailable?: boolean;
  isFeatured?: boolean;
  displayOrder?: number;
  stripeProductId?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  stripePriceIdUnit?: string;
}

export interface SeededCategory {
  id: string;
  slug: string;
}

export interface SeededProduct {
  id: string;
  slug: string;
  categoryId: string;
}

export interface AddToCartOptions {
  accessToken?: string;
  sessionId?: string;
  quantity?: number;
  billingPeriod?: BillingPeriod;
}

export interface CheckoutOptions {
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  email?: string;
}

// ==================== Seed Functions ====================

let categoryCounter = 0;
let productCounter = 0;

/**
 * Insert a test category directly in the database.
 */
export async function seedCategory(ds: DataSource, dto?: SeedCategoryDto): Promise<SeededCategory> {
  categoryCounter++;
  const slug = dto?.slug || `test-category-${categoryCounter}-${Date.now()}`;
  const nameFr = dto?.nameFr || `Catégorie Test ${categoryCounter}`;
  const nameEn = dto?.nameEn || `Test Category ${categoryCounter}`;

  const result = await ds.query(
    `INSERT INTO categories (slug, name_fr, name_en, description_fr, description_en, image_url, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, slug`,
    [
      slug,
      nameFr,
      nameEn,
      dto?.descriptionFr || `Description FR ${categoryCounter}`,
      dto?.descriptionEn || `Description EN ${categoryCounter}`,
      dto?.imageUrl || null,
      dto?.displayOrder ?? 0,
      dto?.isActive ?? true,
    ],
  );

  return { id: result[0].id, slug: result[0].slug };
}

/**
 * Insert a test product directly in the database.
 */
export async function seedProduct(
  ds: DataSource,
  categoryId: string,
  dto?: SeedProductDto,
): Promise<SeededProduct> {
  productCounter++;
  const slug = dto?.slug || `test-product-${productCounter}-${Date.now()}`;
  const sku = dto?.sku || `SKU-TEST-${productCounter}-${Date.now()}`;

  const result = await ds.query(
    `INSERT INTO products (
       category_id, slug, sku, name_fr, name_en, description_fr, description_en,
       short_description_fr, short_description_en, product_type,
       price_monthly, price_yearly, price_unit, stock_quantity, stock_alert_threshold,
       is_available, is_featured, display_order,
       stripe_product_id, stripe_price_id_monthly, stripe_price_id_yearly, stripe_price_id_unit
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     RETURNING id, slug`,
    [
      categoryId,
      slug,
      sku,
      dto?.nameFr || `Produit Test ${productCounter}`,
      dto?.nameEn || `Test Product ${productCounter}`,
      dto?.descriptionFr || `Description FR produit ${productCounter}`,
      dto?.descriptionEn || `Description EN product ${productCounter}`,
      dto?.shortDescriptionFr || null,
      dto?.shortDescriptionEn || null,
      dto?.productType || 'saas',
      dto?.priceMonthly ?? 29.99,
      dto?.priceYearly ?? 299.99,
      dto?.priceUnit ?? null,
      dto?.stockQuantity ?? null,
      dto?.stockAlertThreshold ?? 10,
      dto?.isAvailable ?? true,
      dto?.isFeatured ?? false,
      dto?.displayOrder ?? 0,
      dto?.stripeProductId || null,
      dto?.stripePriceIdMonthly || `price_monthly_test_${productCounter}`,
      dto?.stripePriceIdYearly || `price_yearly_test_${productCounter}`,
      dto?.stripePriceIdUnit || null,
    ],
  );

  return { id: result[0].id, slug: result[0].slug, categoryId };
}

// ==================== API Helpers ====================

/**
 * Add a product to the cart via POST /api/v1/cart/items.
 */
export function addToCart(
  app: INestApplication,
  productId: string,
  opts?: AddToCartOptions,
): request.Test {
  const req = request(app.getHttpServer())
    .post('/api/v1/cart/items')
    .send({
      productId,
      quantity: opts?.quantity ?? 1,
      billingPeriod: opts?.billingPeriod ?? BillingPeriod.ONE_TIME,
    });

  if (opts?.accessToken) {
    req.set('Authorization', `Bearer ${opts.accessToken}`);
  }
  if (opts?.sessionId) {
    req.set('X-Session-Id', opts.sessionId);
  }

  return req;
}

/**
 * Create a checkout payment intent via POST /api/v1/checkout/payment-intent.
 */
export function createCheckout(
  app: INestApplication,
  cartId: string,
  accessToken: string,
  opts?: CheckoutOptions,
): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/checkout/payment-intent')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      cartId,
      billingAddress: opts?.billingAddress ?? {
        firstName: 'Test',
        lastName: 'User',
        street: '123 Test Street',
        city: 'Paris',
        postalCode: '75001',
        country: 'FR',
      },
      shippingAddress: opts?.shippingAddress,
      email: opts?.email ?? 'test@example.com',
    });
}

/**
 * Reset seed counters. Call in beforeAll/beforeEach for isolation.
 */
export function resetSeedCounters(): void {
  categoryCounter = 0;
  productCounter = 0;
}
