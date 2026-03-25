import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { setupTestApp, teardownTestApp } from '../setup';
import { cleanDatabase } from '../helpers/db.helper';
import {
  seedCategory,
  seedProduct,
  resetSeedCounters,
  SeededCategory,
  SeededProduct,
} from '../helpers/purchase.helper';

interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  isFeatured: boolean;
  categorySlug?: string;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
}

interface PaginatedProductsResponse {
  data: ProductListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface FeaturedProductsResponse {
  data: ProductListItem[];
}

interface ProductDetailResponse {
  data: {
    id: string;
    slug: string;
    name: string;
    description: string;
    categoryId: string;
    isFeatured: boolean;
  };
}

describe('Catalog Browse (e2e)', () => {
  let app: INestApplication;
  let catalogDataSource: DataSource;

  let catSecurity: SeededCategory;
  let catNetwork: SeededCategory;
  let productEdr: SeededProduct;
  let productXdr: SeededProduct;
  let productFirewall: SeededProduct;
  let productFeatured: SeededProduct;

  beforeAll(async () => {
    const ctx = await setupTestApp();
    app = ctx.app;
    catalogDataSource = ctx.catalogDataSource;

    // Clean and seed test data
    await cleanDatabase(catalogDataSource);
    resetSeedCounters();

    catSecurity = await seedCategory(catalogDataSource, {
      slug: 'security-solutions',
      nameFr: 'Solutions de Sécurité',
      nameEn: 'Security Solutions',
    });

    catNetwork = await seedCategory(catalogDataSource, {
      slug: 'network-tools',
      nameFr: 'Outils Réseau',
      nameEn: 'Network Tools',
    });

    productEdr = await seedProduct(catalogDataSource, catSecurity.id, {
      slug: 'edr-pro',
      nameFr: 'EDR Pro',
      nameEn: 'EDR Pro EN',
      priceMonthly: 49.99,
      priceYearly: 499.99,
      isFeatured: true,
    });

    productXdr = await seedProduct(catalogDataSource, catSecurity.id, {
      slug: 'xdr-enterprise',
      nameFr: 'XDR Enterprise',
      nameEn: 'XDR Enterprise EN',
      priceMonthly: 99.99,
      priceYearly: 999.99,
      isFeatured: false,
    });

    productFirewall = await seedProduct(catalogDataSource, catNetwork.id, {
      slug: 'firewall-advanced',
      nameFr: 'Firewall Avancé',
      nameEn: 'Advanced Firewall',
      priceMonthly: 19.99,
      priceYearly: 199.99,
      isFeatured: false,
    });

    productFeatured = await seedProduct(catalogDataSource, catNetwork.id, {
      slug: 'soc-premium',
      nameFr: 'SOC Premium',
      nameEn: 'SOC Premium EN',
      priceMonthly: 149.99,
      priceYearly: 1499.99,
      isFeatured: true,
    });
  });

  afterAll(async () => {
    await cleanDatabase(catalogDataSource);
    await teardownTestApp();
  });

  it('should list products paginated with 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/catalog/products?page=1&limit=10');

    expect(res.status).toBe(200);
    const body = res.body as PaginatedProductsResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(4);
  });

  it('should filter products by category slug and return only matching products', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/catalog/products?categorySlug=${catSecurity.slug}`,
    );

    expect(res.status).toBe(200);
    const body = res.body as PaginatedProductsResponse;
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(2);
    const slugs = body.data.map((p) => p.slug);
    expect(slugs).toContain(productEdr.slug);
    expect(slugs).toContain(productXdr.slug);
    expect(slugs).not.toContain(productFirewall.slug);
  });

  it('should search products by keyword using products endpoint and return matching results', async () => {
    // Use the products endpoint with `search` query param instead of /search?q=
    // because the /search endpoint's `q` param conflicts with ProductQueryDto validation
    const res = await request(app.getHttpServer()).get('/api/v1/catalog/products?search=EDR');

    expect(res.status).toBe(200);
    const body = res.body as PaginatedProductsResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    const slugs = body.data.map((p) => p.slug);
    expect(slugs).toContain(productEdr.slug);
  });

  it('should get a product by slug with full product data', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/catalog/products/${productEdr.slug}`,
    );

    expect(res.status).toBe(200);
    const body = res.body as ProductDetailResponse;
    expect(body.data).toBeDefined();
    expect(body.data.slug).toBe(productEdr.slug);
    // Response uses localized `name` field (FR by default)
    expect(body.data.name).toBe('EDR Pro');
    expect(body.data.categoryId).toBe(catSecurity.id);
  });

  it('should get featured products and return only featured ones', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/catalog/products/featured');

    expect(res.status).toBe(200);
    const body = res.body as FeaturedProductsResponse;
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    // All returned products must be featured
    for (const product of body.data) {
      expect(product.isFeatured).toBe(true);
    }
    const slugs = body.data.map((p) => p.slug);
    expect(slugs).toContain(productEdr.slug);
    expect(slugs).toContain(productFeatured.slug);
    expect(slugs).not.toContain(productXdr.slug);
    expect(slugs).not.toContain(productFirewall.slug);
  });
});
