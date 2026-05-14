import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { CynaLoggerService, CynaCacheService, SERVICE_NAMES } from '@cyna-api/common';
import { TopProductsService } from './top-products.service';
import { TopProductConfig } from '../entities';
import { ContentEventsPublisher } from '../events';

describe('TopProductsService', () => {
  let service: TopProductsService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let cache: { getOrSet: jest.Mock; del: jest.Mock; delByPattern: jest.Mock };
  let catalogClient: { send: jest.Mock };
  let events: { emitTopProductsUpdated: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; debug: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    cache = {
      getOrSet: jest.fn((_k, fn) => fn()),
      del: jest.fn(),
      delByPattern: jest.fn(),
    };
    catalogClient = { send: jest.fn() };
    events = { emitTopProductsUpdated: jest.fn() };
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopProductsService,
        { provide: getRepositoryToken(TopProductConfig), useValue: repo },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: CynaLoggerService, useValue: logger },
        { provide: CynaCacheService, useValue: cache },
        { provide: ContentEventsPublisher, useValue: events },
      ],
    }).compile();
    service = module.get(TopProductsService);
  });

  describe('getFullSyncSnapshot', () => {
    it('returns all 3 sets', async () => {
      repo.findOne
        .mockResolvedValueOnce({ productIds: ['s1'] })
        .mockResolvedValueOnce({ productIds: ['p1'] })
        .mockResolvedValueOnce({ productIds: ['l1'] });
      const r = await service.getFullSyncSnapshot();
      expect(r).toEqual({ saasIds: ['s1'], physicalIds: ['p1'], licenseIds: ['l1'] });
    });

    it('returns empty arrays when none', async () => {
      repo.findOne.mockResolvedValue(null);
      const r = await service.getFullSyncSnapshot();
      expect(r).toEqual({ saasIds: [], physicalIds: [], licenseIds: [] });
    });
  });

  it.each([
    ['getTopServices', 'top_services'],
    ['getTopProducts', 'top_products'],
    ['getTopLicenses', 'top_licenses'],
  ])('%s returns existing config', async (method, configType) => {
    repo.findOne.mockResolvedValue({ configType, productIds: ['a'] });
    const r = await (service as unknown as Record<string, () => Promise<{ productIds: string[] }>>)[
      method
    ]();
    expect(r.productIds).toEqual(['a']);
  });

  it('getTopServices creates default when none', async () => {
    repo.findOne.mockResolvedValue(null);
    const r = await service.getTopServices();
    expect(r.productIds).toEqual([]);
  });

  it('getTopProducts creates default when none', async () => {
    repo.findOne.mockResolvedValue(null);
    const r = await service.getTopProducts();
    expect(r.productIds).toEqual([]);
  });

  it('getTopLicenses creates default when none', async () => {
    repo.findOne.mockResolvedValue(null);
    const r = await service.getTopLicenses();
    expect(r.productIds).toEqual([]);
  });

  describe('resolveProductDetails (via getTopServicesWithDetails)', () => {
    it('returns empty when no productIds', async () => {
      repo.findOne.mockResolvedValue({ configType: 'top_services', productIds: [] });
      const r = await service.getTopServicesWithDetails();
      expect(r.products).toEqual([]);
    });

    it('localizes product to FR', async () => {
      repo.findOne.mockResolvedValue({ configType: 'top_services', productIds: ['p1'] });
      catalogClient.send.mockReturnValue(
        of({
          id: 'p1',
          slug: 'p1',
          nameFr: 'FR',
          nameEn: 'EN',
          productType: 'saas',
          priceMonthly: '10',
          priceYearly: '100',
          priceUnit: '5',
          isAvailable: true,
          isFeatured: true,
          images: [{ imageUrl: 'img', isPrimary: true, displayOrder: 0 }],
          category: { id: 'c1', slug: 'c', nameFr: 'CatFR', nameEn: 'CatEN' },
          categoryId: 'c1',
        }),
      );
      const r = await service.getTopServicesWithDetails('fr');
      expect(r.products[0]).toMatchObject({
        name: 'FR',
        priceMonthly: 10,
        priceYearly: 100,
        priceUnit: 5,
        primaryImageUrl: 'img',
        categoryName: 'CatFR',
      });
    });

    it('localizes product to EN with fallback to first image when no primary', async () => {
      repo.findOne.mockResolvedValue({ configType: 'top_services', productIds: ['p1'] });
      catalogClient.send.mockReturnValue(
        of({
          id: 'p1',
          slug: 'p1',
          nameFr: 'FR',
          nameEn: 'EN',
          productType: 'saas',
          isAvailable: true,
          isFeatured: false,
          images: [{ imageUrl: 'first', isPrimary: false, displayOrder: 0 }],
        }),
      );
      const r = await service.getTopServicesWithDetails('en');
      expect(r.products[0]).toMatchObject({
        name: 'EN',
        primaryImageUrl: 'first',
      });
    });

    it('skips product on catalog error and logs warning', async () => {
      repo.findOne.mockResolvedValue({ configType: 'top_services', productIds: ['p1'] });
      catalogClient.send.mockReturnValue(throwError(() => new Error('catalog down')));
      const r = await service.getTopServicesWithDetails();
      expect(r.products).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('persistConfig (via updateTopServices)', () => {
    it('creates config when none exists and emits added/removed', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.updateTopServices({ productIds: ['a', 'b'] } as never);
      expect(events.emitTopProductsUpdated).toHaveBeenCalledWith({
        productType: 'saas',
        added: ['a', 'b'],
        removed: [],
      });
    });

    it('updates existing config and computes diffs', async () => {
      repo.findOne.mockResolvedValue({
        configType: 'top_services',
        productIds: ['a', 'b'],
      });
      await service.updateTopServices({ productIds: ['b', 'c'] } as never);
      expect(events.emitTopProductsUpdated).toHaveBeenCalledWith({
        productType: 'saas',
        added: ['c'],
        removed: ['a'],
      });
    });
  });

  it('updateTopProducts uses physical type', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.updateTopProducts({ productIds: ['x'] } as never);
    expect(events.emitTopProductsUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ productType: 'physical' }),
    );
  });

  it('updateTopLicenses uses license type', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.updateTopLicenses({ productIds: ['x'] } as never);
    expect(events.emitTopProductsUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ productType: 'license' }),
    );
  });

  describe('toggleFeatured', () => {
    it('returns early when adding existing featured', async () => {
      repo.findOne.mockResolvedValue({ productIds: ['p1'] });
      const r = await service.toggleFeatured({
        productType: 'saas',
        productId: 'p1',
        featured: true,
      } as never);
      expect(repo.save).not.toHaveBeenCalled();
      expect(r.productIds).toEqual(['p1']);
    });

    it('returns early when removing not-featured', async () => {
      repo.findOne.mockResolvedValue({ productIds: ['p2'] });
      const r = await service.toggleFeatured({
        productType: 'saas',
        productId: 'p1',
        featured: false,
      } as never);
      expect(repo.save).not.toHaveBeenCalled();
      expect(r.productIds).toEqual(['p2']);
    });

    it('returns new empty config when removing not-featured from no config', async () => {
      repo.findOne.mockResolvedValue(null);
      const r = await service.toggleFeatured({
        productType: 'saas',
        productId: 'p1',
        featured: false,
      } as never);
      expect(repo.save).not.toHaveBeenCalled();
      expect(r.productIds).toEqual([]);
    });

    it('throws when featured limit reached', async () => {
      repo.findOne.mockResolvedValue({
        productIds: ['1', '2', '3', '4', '5', '6', '7', '8'],
      });
      await expect(
        service.toggleFeatured({
          productType: 'saas',
          productId: 'p9',
          featured: true,
        } as never),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('adds featured product when below limit', async () => {
      repo.findOne.mockResolvedValue({ productIds: ['a'] });
      await service.toggleFeatured({
        productType: 'saas',
        productId: 'b',
        featured: true,
      } as never);
      expect(events.emitTopProductsUpdated).toHaveBeenCalledWith({
        productType: 'saas',
        added: ['b'],
        removed: [],
      });
    });

    it('removes featured product', async () => {
      repo.findOne.mockResolvedValue({ productIds: ['a', 'b'] });
      await service.toggleFeatured({
        productType: 'saas',
        productId: 'a',
        featured: false,
      } as never);
      expect(events.emitTopProductsUpdated).toHaveBeenCalledWith({
        productType: 'saas',
        added: [],
        removed: ['a'],
      });
    });

    it('creates new config when none and adding featured', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.toggleFeatured({
        productType: 'physical',
        productId: 'p1',
        featured: true,
      } as never);
      expect(repo.create).toHaveBeenCalled();
    });

    it('handles license product type', async () => {
      repo.findOne.mockResolvedValue({ productIds: [] });
      await service.toggleFeatured({
        productType: 'license',
        productId: 'l1',
        featured: true,
      } as never);
      expect(events.emitTopProductsUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ productType: 'license' }),
      );
    });
  });
});
