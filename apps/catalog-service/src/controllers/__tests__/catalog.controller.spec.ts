import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { CatalogController } from '../catalog.controller';
import { CategoryService, ProductService, StockService } from '../../services';
import { Category, Product, ProductType, ProductImage } from '../../entities';
import { Language } from '@cyna-api/common';

// Mock du channel RabbitMQ pour l'ACK manuel
const mockChannel = {
  ack: jest.fn(),
};

// Mock du RmqContext
const createMockRmqContext = (): RmqContext =>
  ({
    getChannelRef: jest.fn().mockReturnValue(mockChannel),
    getMessage: jest.fn().mockReturnValue({}),
    getPattern: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
  }) as unknown as RmqContext;

// Fixture: categorie pour les tests
const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-uuid-001',
  slug: 'services',
  nameFr: 'Services',
  nameEn: 'Services',
  displayOrder: 1,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  products: [],
  ...overrides,
});

// Fixture: produit pour les tests
const createMockProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-uuid-001',
  categoryId: 'cat-uuid-001',
  slug: 'soc-premium',
  sku: 'SOC-001',
  nameFr: 'SOC Premium',
  nameEn: 'SOC Premium',
  descriptionFr: 'Description FR',
  descriptionEn: 'Description EN',
  productType: ProductType.SAAS,
  priceMonthly: 299,
  priceYearly: 2990,
  stockAlertThreshold: 10,
  isAvailable: true,
  isFeatured: false,
  displayOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  category: createMockCategory(),
  images: [],
  characteristics: [],
  stockReservations: [],
  ...overrides,
});

// Mock du CategoryService
const mockCategoryService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

// Mock du ProductService
const mockProductService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  search: jest.fn(),
  findFeatured: jest.fn(),
  findByCategory: jest.fn(),
  addImage: jest.fn(),
  deleteImage: jest.fn(),
  setPrimaryImage: jest.fn(),
  reorderImages: jest.fn(),
};

// Mock du StockService
const mockStockService = {
  updateStock: jest.fn(),
  getStockInfo: jest.fn(),
  getStockAlerts: jest.fn(),
  checkAvailability: jest.fn(),
  reserveStock: jest.fn(),
  releaseReservation: jest.fn(),
  confirmReservation: jest.fn(),
};

// Tests d'integration du CatalogController
describe('CatalogController', () => {
  let controller: CatalogController;
  let context: RmqContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: ProductService, useValue: mockProductService },
        { provide: StockService, useValue: mockStockService },
      ],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
    context = createMockRmqContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Category Endpoints ====================
  describe('Category Endpoints', () => {
    // Verifie que createCategory appelle le service et ACK le message
    describe('createCategory()', () => {
      it('should call categoryService.create and ACK the message', async () => {
        const dto = { slug: 'test', nameFr: 'Test', nameEn: 'Test' };
        const category = createMockCategory(dto);

        mockCategoryService.create.mockResolvedValue(category);

        await controller.createCategory(dto, context);

        expect(mockCategoryService.create).toHaveBeenCalledWith(dto);
        expect(mockChannel.ack).toHaveBeenCalled();
      });

      // Verifie que le message est ACK meme en cas d'erreur
      it('should ACK message even on error', async () => {
        mockCategoryService.create.mockRejectedValue(new Error('Test error'));

        await expect(
          controller.createCategory({ slug: 'test', nameFr: 'Test', nameEn: 'Test' }, context),
        ).rejects.toThrow();

        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que updateCategory appelle le service avec les bons parametres
    describe('updateCategory()', () => {
      it('should call categoryService.update and ACK the message', async () => {
        const category = createMockCategory();
        mockCategoryService.update.mockResolvedValue(category);

        await controller.updateCategory({ id: 'cat-001', dto: { nameFr: 'Updated' } }, context);

        expect(mockCategoryService.update).toHaveBeenCalledWith('cat-001', { nameFr: 'Updated' });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que deleteCategory appelle le service
    describe('deleteCategory()', () => {
      it('should call categoryService.delete and ACK the message', async () => {
        mockCategoryService.delete.mockResolvedValue(undefined);

        const result = await controller.deleteCategory({ id: 'cat-001' }, context);

        expect(mockCategoryService.delete).toHaveBeenCalledWith('cat-001');
        expect(result).toEqual({ success: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findAllCategories retourne les categories avec le bon language
    describe('findAllCategories()', () => {
      it('should call categoryService.findAll and ACK the message', async () => {
        const categories = [createMockCategory()];
        mockCategoryService.findAll.mockResolvedValue(categories);

        await controller.findAllCategories({ isActive: true }, context);

        expect(mockCategoryService.findAll).toHaveBeenCalledWith({ isActive: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findCategoryBySlug appelle le service
    describe('findCategoryBySlug()', () => {
      it('should call categoryService.findBySlug and ACK the message', async () => {
        const category = createMockCategory();
        mockCategoryService.findBySlug.mockResolvedValue(category);

        await controller.findCategoryBySlug({ slug: 'services', lang: Language.EN }, context);

        expect(mockCategoryService.findBySlug).toHaveBeenCalledWith('services');
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findCategoryById appelle le service
    describe('findCategoryById()', () => {
      it('should call categoryService.findById and ACK the message', async () => {
        const category = createMockCategory();
        mockCategoryService.findById.mockResolvedValue(category);

        await controller.findCategoryById({ id: 'cat-001' }, context);

        expect(mockCategoryService.findById).toHaveBeenCalledWith('cat-001');
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });
  });

  // ==================== Product Endpoints ====================
  describe('Product Endpoints', () => {
    // Verifie que createProduct appelle le service
    describe('createProduct()', () => {
      it('should call productService.create and ACK the message', async () => {
        const dto = {
          categoryId: 'cat-001',
          slug: 'test',
          sku: 'TEST-001',
          nameFr: 'Test',
          nameEn: 'Test',
          descriptionFr: 'Desc',
          descriptionEn: 'Desc',
          productType: ProductType.SAAS,
        };
        const product = createMockProduct(dto);

        mockProductService.create.mockResolvedValue(product);

        await controller.createProduct(dto, context);

        expect(mockProductService.create).toHaveBeenCalledWith(dto);
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que updateProduct appelle le service
    describe('updateProduct()', () => {
      it('should call productService.update and ACK the message', async () => {
        const product = createMockProduct();
        mockProductService.update.mockResolvedValue(product);

        await controller.updateProduct({ id: 'prod-001', dto: { nameFr: 'Updated' } }, context);

        expect(mockProductService.update).toHaveBeenCalledWith('prod-001', { nameFr: 'Updated' });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que deleteProduct appelle le service
    describe('deleteProduct()', () => {
      it('should call productService.delete and ACK the message', async () => {
        mockProductService.delete.mockResolvedValue(undefined);

        const result = await controller.deleteProduct({ id: 'prod-001' }, context);

        expect(mockProductService.delete).toHaveBeenCalledWith('prod-001');
        expect(result).toEqual({ success: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findAllProducts retourne les produits pagines
    describe('findAllProducts()', () => {
      it('should call productService.findAll and ACK the message', async () => {
        mockProductService.findAll.mockResolvedValue({
          data: [createMockProduct()],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        await controller.findAllProducts({ page: 1, limit: 20 }, context);

        expect(mockProductService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findProductBySlug appelle le service
    describe('findProductBySlug()', () => {
      it('should call productService.findBySlug and ACK the message', async () => {
        const product = createMockProduct();
        mockProductService.findBySlug.mockResolvedValue(product);

        await controller.findProductBySlug({ slug: 'soc-premium' }, context);

        expect(mockProductService.findBySlug).toHaveBeenCalledWith('soc-premium');
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que searchProducts appelle le service avec les bons parametres
    describe('searchProducts()', () => {
      it('should call productService.search and ACK the message', async () => {
        mockProductService.search.mockResolvedValue({
          data: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
        });

        await controller.searchProducts(
          { searchTerm: 'security', query: { page: 1, limit: 20 } },
          context,
        );

        expect(mockProductService.search).toHaveBeenCalledWith('security', { page: 1, limit: 20 });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que findFeaturedProducts appelle le service
    describe('findFeaturedProducts()', () => {
      it('should call productService.findFeatured and ACK the message', async () => {
        mockProductService.findFeatured.mockResolvedValue([
          createMockProduct({ isFeatured: true }),
        ]);

        await controller.findFeaturedProducts({ limit: 5 }, context);

        expect(mockProductService.findFeatured).toHaveBeenCalledWith(5);
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });
  });

  // ==================== Product Images Endpoints ====================
  describe('Product Images Endpoints', () => {
    // Verifie que addProductImage appelle le service
    describe('addProductImage()', () => {
      it('should call productService.addImage and ACK the message', async () => {
        const image = { id: 'img-001', isPrimary: true } as ProductImage;
        mockProductService.addImage.mockResolvedValue(image);

        await controller.addProductImage(
          {
            productId: 'prod-001',
            imageUrl: 'https://example.com/img.png',
            isPrimary: true,
          },
          context,
        );

        expect(mockProductService.addImage).toHaveBeenCalledWith(
          'prod-001',
          'https://example.com/img.png',
          undefined,
          undefined,
          true,
        );
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que deleteProductImage appelle le service
    describe('deleteProductImage()', () => {
      it('should call productService.deleteImage and ACK the message', async () => {
        mockProductService.deleteImage.mockResolvedValue(undefined);

        const result = await controller.deleteProductImage(
          { productId: 'prod-001', imageId: 'img-001' },
          context,
        );

        expect(mockProductService.deleteImage).toHaveBeenCalledWith('prod-001', 'img-001');
        expect(result).toEqual({ success: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que setPrimaryProductImage appelle le service
    describe('setPrimaryProductImage()', () => {
      it('should call productService.setPrimaryImage and ACK the message', async () => {
        const image = { id: 'img-001', isPrimary: true } as ProductImage;
        mockProductService.setPrimaryImage.mockResolvedValue(image);

        await controller.setPrimaryProductImage(
          { productId: 'prod-001', imageId: 'img-001' },
          context,
        );

        expect(mockProductService.setPrimaryImage).toHaveBeenCalledWith('prod-001', 'img-001');
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que reorderProductImages appelle le service
    describe('reorderProductImages()', () => {
      it('should call productService.reorderImages and ACK the message', async () => {
        mockProductService.reorderImages.mockResolvedValue([]);

        await controller.reorderProductImages(
          { productId: 'prod-001', imageIds: ['img-002', 'img-001'] },
          context,
        );

        expect(mockProductService.reorderImages).toHaveBeenCalledWith('prod-001', [
          'img-002',
          'img-001',
        ]);
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });
  });

  // ==================== Stock Endpoints ====================
  describe('Stock Endpoints', () => {
    // Verifie que updateStock appelle le service
    describe('updateStock()', () => {
      it('should call stockService.updateStock and ACK the message', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });
        mockStockService.updateStock.mockResolvedValue(product);

        await controller.updateStock(
          { productId: 'prod-001', dto: { stockQuantity: 100 } },
          context,
        );

        expect(mockStockService.updateStock).toHaveBeenCalledWith('prod-001', 100, undefined);
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que getStockInfo appelle le service
    describe('getStockInfo()', () => {
      it('should call stockService.getStockInfo and ACK the message', async () => {
        mockStockService.getStockInfo.mockResolvedValue({
          stockQuantity: 100,
          reservedQuantity: 10,
          availableQuantity: 90,
        });

        await controller.getStockInfo({ productId: 'prod-001' }, context);

        expect(mockStockService.getStockInfo).toHaveBeenCalledWith('prod-001');
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que getStockAlerts appelle le service
    describe('getStockAlerts()', () => {
      it('should call stockService.getStockAlerts and ACK the message', async () => {
        mockStockService.getStockAlerts.mockResolvedValue([]);

        await controller.getStockAlerts(context);

        expect(mockStockService.getStockAlerts).toHaveBeenCalled();
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que checkStockAvailability appelle le service
    describe('checkStockAvailability()', () => {
      it('should call stockService.checkAvailability and ACK the message', async () => {
        mockStockService.checkAvailability.mockResolvedValue({ available: true });

        await controller.checkStockAvailability({ productId: 'prod-001', quantity: 10 }, context);

        expect(mockStockService.checkAvailability).toHaveBeenCalledWith('prod-001', 10);
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que reserveStock appelle le service
    describe('reserveStock()', () => {
      it('should call stockService.reserveStock and ACK the message', async () => {
        mockStockService.reserveStock.mockResolvedValue({ id: 'res-001' });

        await controller.reserveStock(
          { productId: 'prod-001', cartId: 'cart-001', quantity: 5 },
          context,
        );

        expect(mockStockService.reserveStock).toHaveBeenCalledWith(
          'prod-001',
          'cart-001',
          5,
          undefined,
        );
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que releaseStock appelle le service
    describe('releaseStock()', () => {
      it('should call stockService.releaseReservation and ACK the message', async () => {
        mockStockService.releaseReservation.mockResolvedValue(undefined);

        const result = await controller.releaseStock({ cartId: 'cart-001' }, context);

        expect(mockStockService.releaseReservation).toHaveBeenCalledWith('cart-001');
        expect(result).toEqual({ success: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });

    // Verifie que confirmStock appelle le service
    describe('confirmStock()', () => {
      it('should call stockService.confirmReservation and ACK the message', async () => {
        mockStockService.confirmReservation.mockResolvedValue(undefined);

        const result = await controller.confirmStock({ cartId: 'cart-001' }, context);

        expect(mockStockService.confirmReservation).toHaveBeenCalledWith('cart-001');
        expect(result).toEqual({ success: true });
        expect(mockChannel.ack).toHaveBeenCalled();
      });
    });
  });

  // ==================== ACK Verification ====================
  describe('RabbitMQ Manual ACK', () => {
    // Verifie que tous les endpoints font un ACK manuel du message
    it('should always ACK the message for all endpoints', async () => {
      // Test multiple endpoints
      mockCategoryService.findAll.mockResolvedValue([]);
      await controller.findAllCategories({}, context);

      mockProductService.findAll.mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      await controller.findAllProducts({}, context);

      mockStockService.getStockAlerts.mockResolvedValue([]);
      await controller.getStockAlerts(context);

      expect(mockChannel.ack).toHaveBeenCalledTimes(3);
    });
  });
});
