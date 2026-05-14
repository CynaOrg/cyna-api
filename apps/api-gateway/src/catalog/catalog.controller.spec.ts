import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Language } from '@cyna-api/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('CatalogController', () => {
  let controller: CatalogController;
  let catalogClient: { send: jest.Mock };

  beforeEach(async () => {
    catalogClient = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [CatalogService, { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient }],
    }).compile();
    controller = module.get(CatalogController);
  });

  it('GET /categories forwards query', async () => {
    await controller.findAllCategories({ isActive: true } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL, {
      isActive: true,
    });
  });

  it('GET /categories/:slug forwards slug + lang', async () => {
    await controller.findCategoryBySlug('soc', Language.EN);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_SLUG,
      { slug: 'soc', lang: Language.EN },
    );
  });

  it('GET /products forwards query', async () => {
    await controller.findAllProducts({ page: 1 } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, {
      page: 1,
    });
  });

  it('GET /products/featured forwards limit + lang', async () => {
    await controller.findFeaturedProducts(5, Language.FR);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_FEATURED,
      { limit: 5, lang: Language.FR },
    );
  });

  it('GET /products/:slug forwards slug + lang', async () => {
    await controller.findProductBySlug('edr-pro', Language.EN);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG, {
      slug: 'edr-pro',
      lang: Language.EN,
    });
  });

  it('GET /products/:slug/stock first resolves product, then gets stock', async () => {
    catalogClient.send
      .mockReturnValueOnce(of({ id: 'p1', slug: 'edr-pro' }))
      .mockReturnValueOnce(of({ stock: 12 }));
    const r = await controller.getProductStock('edr-pro');
    expect(catalogClient.send).toHaveBeenNthCalledWith(
      1,
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_SLUG,
      { slug: 'edr-pro', lang: undefined },
    );
    expect(catalogClient.send).toHaveBeenNthCalledWith(2, MESSAGE_PATTERNS.CATALOG.STOCK_GET_INFO, {
      productId: 'p1',
    });
    expect(r).toEqual({ stock: 12 });
  });

  it('GET /search forwards searchTerm + query', async () => {
    await controller.searchProducts('soc', { page: 2 } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH, {
      searchTerm: 'soc',
      query: { page: 2 },
    });
  });

  it('GET /search defaults empty string when q is missing', async () => {
    await controller.searchProducts('', {} as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_SEARCH, {
      searchTerm: '',
      query: {},
    });
  });
});
