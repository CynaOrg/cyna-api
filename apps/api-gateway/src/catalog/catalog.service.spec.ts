import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { CatalogService } from './catalog.service';

describe('Gateway CatalogService', () => {
  let service: CatalogService;
  let catalogClient: { send: jest.Mock };

  beforeEach(async () => {
    catalogClient = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogService, { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient }],
    }).compile();
    service = module.get(CatalogService);
  });

  it('findProductById forwards id', async () => {
    await service.findProductById('p');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, {
      id: 'p',
    });
  });

  it('findProductsByCategory forwards categoryId and query', async () => {
    await service.findProductsByCategory('c1', { page: 1 } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_CATEGORY,
      { categoryId: 'c1', query: { page: 1 } },
    );
  });

  it('setPrimaryProductImage forwards', async () => {
    await service.setPrimaryProductImage('p', 'i');
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_SET_PRIMARY_IMAGE,
      { productId: 'p', imageId: 'i' },
    );
  });

  it('checkStockAvailability forwards', async () => {
    await service.checkStockAvailability('p', 3);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.STOCK_CHECK_AVAILABILITY,
      { productId: 'p', quantity: 3 },
    );
  });

  it('reserveStock forwards full dto', async () => {
    const dto = { productId: 'p', cartId: 'c', quantity: 2 };
    await service.reserveStock(dto);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.STOCK_RESERVE, dto);
  });

  it('releaseStock forwards cartId', async () => {
    await service.releaseStock('cart-1');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.STOCK_RELEASE, {
      cartId: 'cart-1',
    });
  });

  it('confirmStock forwards cartId', async () => {
    await service.confirmStock('cart-1');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.STOCK_CONFIRM, {
      cartId: 'cart-1',
    });
  });

  it('findCategoryById forwards', async () => {
    await service.findCategoryById('c');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_BY_ID, {
      id: 'c',
    });
  });

  describe('errors', () => {
    it('maps RPC error to HttpException', async () => {
      catalogClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 409, message: 'Conflict' })),
      );
      await expect(service.findProductById('p')).rejects.toBeInstanceOf(HttpException);
    });

    it('maps TimeoutError to 503', async () => {
      const e = new Error('Timeout');
      e.name = 'TimeoutError';
      catalogClient.send.mockReturnValueOnce(throwError(() => e));
      await expect(service.findProductById('p')).rejects.toBeInstanceOf(HttpException);
    });

    it('rethrows unknown errors', async () => {
      const e = new Error('Unknown');
      catalogClient.send.mockReturnValueOnce(throwError(() => e));
      await expect(service.findProductById('p')).rejects.toBe(e);
    });
  });
});
