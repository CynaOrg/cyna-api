import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogService } from './catalog.service';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';

describe('CatalogAdminController', () => {
  let controller: CatalogAdminController;
  let catalogClient: { send: jest.Mock };

  beforeEach(async () => {
    catalogClient = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogAdminController],
      providers: [CatalogService, { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient }],
    })
      .overrideGuard(JwtAdminAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CatalogAdminController);
  });

  it('GET /categories uses ADMIN find-all', async () => {
    await controller.findAllCategories({ isActive: true } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.CATEGORY_FIND_ALL_ADMIN,
      { isActive: true },
    );
  });

  it('POST /categories creates a category', async () => {
    await controller.createCategory({ slug: 's' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_CREATE, {
      slug: 's',
    });
  });

  it('PATCH /categories/reorder forwards categoryIds', async () => {
    await controller.reorderCategories({ categoryIds: ['a', 'b'] } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_REORDER, {
      categoryIds: ['a', 'b'],
    });
  });

  it('PATCH /categories/:id updates a category', async () => {
    await controller.updateCategory('id1', { slug: 'x' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_UPDATE, {
      id: 'id1',
      dto: { slug: 'x' },
    });
  });

  it('DELETE /categories/:id deletes a category', async () => {
    await controller.deleteCategory('id1');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.CATEGORY_DELETE, {
      id: 'id1',
    });
  });

  it('GET /products uses ADMIN find-all', async () => {
    await controller.findAllProducts({} as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL_ADMIN,
      {},
    );
  });

  it('POST /products creates a product', async () => {
    await controller.createProduct({ slug: 'p' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_CREATE, {
      slug: 'p',
    });
  });

  it('POST /products/bulk-delete forwards productIds', async () => {
    catalogClient.send.mockReturnValueOnce(of({ deletedCount: 2, failedIds: [] }));
    await controller.bulkDeleteProducts({ productIds: ['a', 'b'] } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_BULK_DELETE, {
      productIds: ['a', 'b'],
    });
  });

  it('GET /products/:id uses ADMIN by-id', async () => {
    await controller.findProductById('pid');
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID_ADMIN,
      { id: 'pid' },
    );
  });

  it('PATCH /products/:id updates a product', async () => {
    await controller.updateProduct('pid', { slug: 'pp' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_UPDATE, {
      id: 'pid',
      dto: { slug: 'pp' },
    });
  });

  it('DELETE /products/:id deletes a product', async () => {
    await controller.deleteProduct('pid');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE, {
      id: 'pid',
    });
  });

  it('POST /products/:id/images adds image', async () => {
    await controller.addProductImage('pid', {
      imageUrl: 'u',
      altTextFr: 'a',
      altTextEn: 'b',
      isPrimary: true,
    } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_ADD_IMAGE, {
      productId: 'pid',
      imageUrl: 'u',
      altTextFr: 'a',
      altTextEn: 'b',
      isPrimary: true,
    });
  });

  it('DELETE /products/:pid/images/:iid deletes image', async () => {
    await controller.deleteProductImage('p', 'i');
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.PRODUCT_DELETE_IMAGE, {
      productId: 'p',
      imageId: 'i',
    });
  });

  it('PATCH /products/:id/images/reorder forwards imageIds', async () => {
    await controller.reorderProductImages('p', { imageIds: ['a', 'b'] } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_REORDER_IMAGES,
      { productId: 'p', imageIds: ['a', 'b'] },
    );
  });

  it('POST /products/:id/images/upload-url forwards dto', async () => {
    await controller.requestImageUploadUrl('p', { fileName: 'x.png' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_REQUEST_UPLOAD_URL,
      expect.objectContaining({ productId: 'p', fileName: 'x.png' }),
    );
  });

  it('POST /products/:id/images/confirm forwards dto', async () => {
    await controller.confirmImageUpload('p', { storageKey: 'k' } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CATALOG.PRODUCT_CONFIRM_IMAGE_UPLOAD,
      expect.objectContaining({ productId: 'p', storageKey: 'k' }),
    );
  });

  it('PATCH /products/:id/stock updates stock', async () => {
    await controller.updateProductStock('p', { stockQuantity: 50 } as never);
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.STOCK_UPDATE, {
      productId: 'p',
      dto: { stockQuantity: 50 },
    });
  });

  it('GET /stock/alerts forwards', async () => {
    await controller.getStockAlerts();
    expect(catalogClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS, {});
  });
});
