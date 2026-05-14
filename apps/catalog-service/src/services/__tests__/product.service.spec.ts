import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';
import { of } from 'rxjs';
import { ProductService } from '../product.service';
import {
  Product,
  Category,
  ProductCharacteristic,
  ProductImage,
  ProductType,
} from '../../entities';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductSortBy,
  SortOrder,
} from '../../dto';
import { CatalogEventsPublisher } from '../../events';
import { CynaLoggerService, CynaCacheService } from '@cyna-api/common';

// Logger mock
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Event publisher mock
const mockEventsPublisher = {
  emitProductCreated: jest.fn(),
  emitProductUpdated: jest.fn(),
  emitProductDeleted: jest.fn(),
};

// Cache service mock
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPattern: jest.fn(),
  getOrSet: jest.fn(),
  invalidateDomain: jest.fn(),
  reset: jest.fn(),
};

// Fixture: category for tests
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

// Fixture: base product for tests
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

// Fixture: product image
const createMockImage = (overrides: Partial<ProductImage> = {}): ProductImage => ({
  id: 'img-uuid-001',
  productId: 'prod-uuid-001',
  imageUrl: 'https://example.com/image.png',
  altTextFr: 'Alt FR',
  altTextEn: 'Alt EN',
  displayOrder: 0,
  isPrimary: true,
  createdAt: new Date('2024-01-01'),
  product: {} as Product,
  ...overrides,
});

// ProductService tests
describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let characteristicRepository: jest.Mocked<Repository<ProductCharacteristic>>;
  let imageRepository: jest.Mocked<Repository<ProductImage>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<Product>>;
  let contentClient: { send: jest.Mock; emit: jest.Mock };

  beforeEach(async () => {
    // QueryBuilder mock for complex queries
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      getMany: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Product>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ProductCharacteristic),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
        {
          provide: CatalogEventsPublisher,
          useValue: mockEventsPublisher,
        },
        {
          provide: CynaCacheService,
          useValue: mockCacheService,
        },
        {
          provide: 'CONTENT_SERVICE',
          useValue: (contentClient = { send: jest.fn(), emit: jest.fn() }),
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    productRepository = module.get(getRepositoryToken(Product));
    categoryRepository = module.get(getRepositoryToken(Category));
    characteristicRepository = module.get(getRepositoryToken(ProductCharacteristic));
    imageRepository = module.get(getRepositoryToken(ProductImage));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Mock getOrSet to execute the factory function
    mockCacheService.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    // Mock get to return undefined (cache miss) by default
    mockCacheService.get.mockResolvedValue(undefined);
  });

  // ==================== Tests CRUD ====================
  describe('CRUD Operations', () => {
    // Product creation tests
    describe('create()', () => {
      // Verifies the creation d'un produit SaaS avec priceMonthly et priceYearly
      it('should create a SaaS product with priceMonthly and priceYearly', async () => {
        const dto: CreateProductDto = {
          categoryId: 'cat-uuid-001',
          slug: 'soc-premium',
          sku: 'SOC-001',
          nameFr: 'SOC Premium',
          nameEn: 'SOC Premium',
          descriptionFr: 'Description',
          descriptionEn: 'Description',
          productType: ProductType.SAAS,
          priceMonthly: 299,
          priceYearly: 2990,
        };
        const mockProduct = createMockProduct({
          categoryId: dto.categoryId,
          slug: dto.slug,
          sku: dto.sku,
          nameFr: dto.nameFr,
          nameEn: dto.nameEn,
          productType: dto.productType,
          priceMonthly: dto.priceMonthly,
          priceYearly: dto.priceYearly,
        });

        categoryRepository.findOne.mockResolvedValue(createMockCategory());
        productRepository.findOne
          .mockResolvedValueOnce(null) // slug check
          .mockResolvedValueOnce(null) // sku check
          .mockResolvedValueOnce(mockProduct); // findById after create
        productRepository.create.mockReturnValue(mockProduct);
        productRepository.save.mockResolvedValue(mockProduct);

        const result = await service.create(dto);

        expect(result.productType).toBe(ProductType.SAAS);
        expect(result.priceMonthly).toBe(299);
        expect(result.priceYearly).toBe(2990);
        expect(mockEventsPublisher.emitProductCreated).toHaveBeenCalled();
      });

      // Verifies the creation d'un produit physical avec priceUnit et stockQuantity
      it('should create a physical product with priceUnit and stockQuantity', async () => {
        const dto: CreateProductDto = {
          categoryId: 'cat-uuid-001',
          slug: 'hardware-001',
          sku: 'HW-001',
          nameFr: 'Hardware',
          nameEn: 'Hardware',
          descriptionFr: 'Description',
          descriptionEn: 'Description',
          productType: ProductType.PHYSICAL,
          priceUnit: 199,
          stockQuantity: 100,
        };
        const mockProduct = createMockProduct({
          productType: ProductType.PHYSICAL,
          priceUnit: 199,
          stockQuantity: 100,
        });

        categoryRepository.findOne.mockResolvedValue(createMockCategory());
        productRepository.findOne
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(mockProduct);
        productRepository.create.mockReturnValue(mockProduct);
        productRepository.save.mockResolvedValue(mockProduct);

        const result = await service.create(dto);

        expect(result.productType).toBe(ProductType.PHYSICAL);
        expect(productRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            priceUnit: 199,
            stockQuantity: 100,
          }),
        );
      });

      // Verifies the creation d'un produit license avec priceUnit sans stock
      it('should create a license product with priceUnit without stock', async () => {
        const dto: CreateProductDto = {
          categoryId: 'cat-uuid-001',
          slug: 'microsoft-365',
          sku: 'LIC-001',
          nameFr: 'Microsoft 365',
          nameEn: 'Microsoft 365',
          descriptionFr: 'Description',
          descriptionEn: 'Description',
          productType: ProductType.LICENSE,
          priceUnit: 49,
        };
        const mockProduct = createMockProduct({
          productType: ProductType.LICENSE,
          priceUnit: 49,
        });

        categoryRepository.findOne.mockResolvedValue(createMockCategory());
        productRepository.findOne
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(mockProduct);
        productRepository.create.mockReturnValue(mockProduct);
        productRepository.save.mockResolvedValue(mockProduct);

        const result = await service.create(dto);

        expect(result.productType).toBe(ProductType.LICENSE);
        expect(productRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            priceUnit: 49,
          }),
        );
      });

      // Verifies an error is thrown when la categorie n'existe pas
      it('should throw RpcException if category does not exist', async () => {
        const dto: CreateProductDto = {
          categoryId: 'non-existent',
          slug: 'test',
          sku: 'TEST-001',
          nameFr: 'Test',
          nameEn: 'Test',
          descriptionFr: 'Desc',
          descriptionEn: 'Desc',
          productType: ProductType.SAAS,
        };

        categoryRepository.findOne.mockResolvedValue(null);

        await expect(service.create(dto)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'CATEGORY_NOT_FOUND',
          }),
        });
      });

      // Verifies an error is thrown when le slug existe deja
      it('should throw RpcException if slug already exists', async () => {
        const dto: CreateProductDto = {
          categoryId: 'cat-uuid-001',
          slug: 'existing-slug',
          sku: 'NEW-001',
          nameFr: 'Test',
          nameEn: 'Test',
          descriptionFr: 'Desc',
          descriptionEn: 'Desc',
          productType: ProductType.SAAS,
        };

        categoryRepository.findOne.mockResolvedValue(createMockCategory());
        productRepository.findOne.mockResolvedValueOnce(createMockProduct({ slug: dto.slug }));

        await expect(service.create(dto)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 409,
            code: 'PRODUCT_SLUG_EXISTS',
          }),
        });
      });

      // Verifies an error is thrown when le SKU existe deja
      it('should throw RpcException if SKU already exists', async () => {
        const dto: CreateProductDto = {
          categoryId: 'cat-uuid-001',
          slug: 'new-slug',
          sku: 'EXISTING-SKU',
          nameFr: 'Test',
          nameEn: 'Test',
          descriptionFr: 'Desc',
          descriptionEn: 'Desc',
          productType: ProductType.SAAS,
        };

        categoryRepository.findOne.mockResolvedValue(createMockCategory());
        productRepository.findOne
          .mockResolvedValueOnce(null) // slug check
          .mockResolvedValueOnce(createMockProduct({ sku: dto.sku })); // sku check

        await expect(service.create(dto)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 409,
            code: 'PRODUCT_SKU_EXISTS',
          }),
        });
      });
    });

    // Search tests across all products
    describe('findAll()', () => {
      // Verifies the pagination correcte
      it('should return correct pagination (page, limit, total, totalPages)', async () => {
        const query: ProductQueryDto = { page: 2, limit: 10 };
        const products = [createMockProduct()];
        const total = 25;

        queryBuilder.getManyAndCount.mockResolvedValue([products, total]);

        const result = await service.findAll(query);

        expect(result.meta.page).toBe(2);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.total).toBe(25);
        expect(result.meta.totalPages).toBe(3);
        expect(queryBuilder.skip).toHaveBeenCalledWith(10);
        expect(queryBuilder.take).toHaveBeenCalledWith(10);
      });

      // Verifies le filtrage par categorySlug
      it('should filter by categorySlug', async () => {
        const query: ProductQueryDto = { categorySlug: 'services' };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('category.slug = :categorySlug', {
          categorySlug: 'services',
        });
      });

      // Verifies le filtrage par productType
      it('should filter by productType', async () => {
        const query: ProductQueryDto = { productType: ProductType.SAAS };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.productType = :productType', {
          productType: ProductType.SAAS,
        });
      });

      // Verifies le filtrage par isAvailable
      it('should filter by isAvailable', async () => {
        const query: ProductQueryDto = { isAvailable: true };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isAvailable = :isAvailable', {
          isAvailable: true,
        });
      });

      // Verifies le filtrage par isFeatured
      it('should filter by isFeatured', async () => {
        const query: ProductQueryDto = { isFeatured: true };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isFeatured = :isFeatured', {
          isFeatured: true,
        });
      });

      // Verifies le filtrage par minPrice
      it('should filter by minPrice', async () => {
        const query: ProductQueryDto = { minPrice: 100 };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.priceMonthly >= :minPrice OR product.priceUnit >= :minPrice)',
          { minPrice: 100 },
        );
      });

      // Verifies le filtrage par maxPrice
      it('should filter by maxPrice', async () => {
        const query: ProductQueryDto = { maxPrice: 500 };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.priceMonthly <= :maxPrice OR product.priceUnit <= :maxPrice)',
          { maxPrice: 500 },
        );
      });

      // Verifies the recherche texte avec ILIKE sur nom et description
      it('should search text on name and description with ILIKE', async () => {
        const query: ProductQueryDto = { search: 'security' };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.nameFr ILIKE :search OR product.nameEn ILIKE :search OR product.descriptionFr ILIKE :search OR product.descriptionEn ILIKE :search)',
          { search: '%security%' },
        );
      });
    });

    // Search tests par slug
    describe('findBySlug()', () => {
      // Verifies un produit avec toutes ses relations est retourne
      it('should return product with all relations', async () => {
        const slug = 'soc-premium';
        const product = createMockProduct({ slug });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.findBySlug(slug);

        expect(productRepository.findOne).toHaveBeenCalledWith({
          where: { slug },
          relations: ['category', 'images', 'characteristics'],
        });
        expect(result).toEqual(product);
      });

      // Verifies a 404 error is thrown when le produit n'existe pas
      it('should throw RpcException with 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(service.findBySlug('non-existent')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // Update tests
    describe('update()', () => {
      // Verifies the mise a jour d'un produit
      it('should update a product', async () => {
        const id = 'prod-uuid-001';
        const dto: UpdateProductDto = { nameFr: 'Updated Name' };
        const existingProduct = createMockProduct({ id });
        const updatedProduct = createMockProduct({ id, nameFr: 'Updated Name' });

        productRepository.findOne.mockResolvedValue(existingProduct);
        productRepository.save.mockResolvedValue(updatedProduct);

        await service.update(id, dto);

        expect(productRepository.save).toHaveBeenCalled();
        expect(mockEventsPublisher.emitProductUpdated).toHaveBeenCalled();
      });

      // Verifies an error is thrown when the new slug already exists
      it('should throw if new slug already exists', async () => {
        const id = 'prod-uuid-001';
        const dto: UpdateProductDto = { slug: 'existing-slug' };
        const existingProduct = createMockProduct({ id, slug: 'old-slug' });

        productRepository.findOne
          .mockResolvedValueOnce(existingProduct)
          .mockResolvedValueOnce(createMockProduct({ slug: 'existing-slug' }));

        await expect(service.update(id, dto)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 409,
            code: 'PRODUCT_SLUG_EXISTS',
          }),
        });
      });

      it('should throw 409 PRODUCT_SKU_EXISTS when new sku is already taken', async () => {
        const id = 'prod-uuid-001';
        const existingProduct = createMockProduct({ id, sku: 'OLD-SKU' });
        productRepository.findOne
          .mockResolvedValueOnce(existingProduct) // findById
          .mockResolvedValueOnce(createMockProduct({ sku: 'NEW-SKU' })); // sku check

        await expect(service.update(id, { sku: 'NEW-SKU' })).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 409,
            code: 'PRODUCT_SKU_EXISTS',
          }),
        });
      });

      it('should throw 404 CATEGORY_NOT_FOUND when target category does not exist', async () => {
        const id = 'prod-uuid-001';
        const existingProduct = createMockProduct({ id, categoryId: 'cat-1' });
        productRepository.findOne.mockResolvedValueOnce(existingProduct);
        categoryRepository.findOne.mockResolvedValueOnce(null);

        await expect(service.update(id, { categoryId: 'cat-2' })).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'CATEGORY_NOT_FOUND',
          }),
        });
      });

      it('should set isFeatured=false when toggling on a non-toggleable productType', async () => {
        const id = 'prod-uuid-001';
        // Create a product whose type does not map to a FeaturedProductType.
        const existingProduct = createMockProduct({
          id,
          productType: 'BUNDLE' as unknown as ProductType,
          isFeatured: true,
        });
        productRepository.findOne
          .mockResolvedValueOnce(existingProduct) // findById
          .mockResolvedValueOnce(existingProduct); // findById after save
        productRepository.save.mockImplementation((p) => Promise.resolve(p as Product));

        await service.update(id, { isFeatured: true });

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ isFeatured: false }),
        );
      });
    });

    // Delete tests (soft delete - PROD-10)
    describe('delete()', () => {
      // Verifies le soft delete d'un produit (deleted_at column)
      it('should soft delete a product', async () => {
        const id = 'prod-uuid-001';
        const product = createMockProduct({ id });

        productRepository.findOne.mockResolvedValue(product);
        (productRepository.softDelete as jest.Mock).mockResolvedValue({
          affected: 1,
        } as unknown as import('typeorm').UpdateResult);

        await service.delete(id);

        expect(productRepository.softDelete).toHaveBeenCalledWith(id);
        expect(productRepository.remove).not.toHaveBeenCalled();
        expect(mockEventsPublisher.emitProductDeleted).toHaveBeenCalled();
      });

      // Verifies a 404 error is thrown when le produit n'existe pas
      it('should throw 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(service.delete('non-existent')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });

      // Verifies le bulk soft delete (deleted_at column)
      it('should soft delete products in bulk', async () => {
        const ids = ['prod-001', 'prod-002'];
        const product1 = createMockProduct({ id: 'prod-001' });
        const product2 = createMockProduct({ id: 'prod-002' });

        productRepository.findOne.mockResolvedValueOnce(product1).mockResolvedValueOnce(product2);
        (productRepository.softDelete as jest.Mock).mockResolvedValue({
          affected: 1,
        } as unknown as import('typeorm').UpdateResult);

        const result = await service.bulkDelete(ids);

        expect(productRepository.softDelete).toHaveBeenCalledWith('prod-001');
        expect(productRepository.softDelete).toHaveBeenCalledWith('prod-002');
        expect(productRepository.remove).not.toHaveBeenCalled();
        expect(result.deletedCount).toBe(2);
        expect(result.failedIds).toEqual([]);
      });
    });
  });

  // ==================== Tests IMAGE Management ====================
  describe('Image Management', () => {
    // Image add tests
    describe('addImage()', () => {
      // Verifies la premiere image devient automatiquement primary
      it('should make first image primary automatically', async () => {
        const productId = 'prod-uuid-001';
        const product = createMockProduct({ id: productId, images: [] });
        const newImage = createMockImage({ productId, isPrimary: true });

        productRepository.findOne.mockResolvedValue(product);
        imageRepository.create.mockReturnValue(newImage);
        imageRepository.save.mockResolvedValue(newImage);

        const result = await service.addImage(productId, 'https://example.com/image.png');

        expect(result.isPrimary).toBe(true);
        expect(imageRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            isPrimary: true,
          }),
        );
      });

      // Verifies when isPrimary=true, les autres images passent a false
      it('should set other images to non-primary when isPrimary=true', async () => {
        const productId = 'prod-uuid-001';
        const existingImage = createMockImage({ productId, isPrimary: true });
        const product = createMockProduct({ id: productId, images: [existingImage] });
        const newImage = createMockImage({ productId, isPrimary: true, id: 'img-002' });

        productRepository.findOne.mockResolvedValue(product);
        imageRepository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
        imageRepository.create.mockReturnValue(newImage);
        imageRepository.save.mockResolvedValue(newImage);

        await service.addImage(
          productId,
          'https://example.com/new.png',
          undefined,
          undefined,
          true,
        );

        expect(imageRepository.update).toHaveBeenCalledWith({ productId }, { isPrimary: false });
      });

      // Verifies a 404 error is thrown when le produit n'existe pas
      it('should throw 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(
          service.addImage('non-existent', 'https://example.com/img.png'),
        ).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // Image delete tests
    describe('deleteImage()', () => {
      // Verifies the suppression d'une image et la reassignation du primary when necessaire
      it('should delete image and reassign primary if it was primary', async () => {
        const productId = 'prod-uuid-001';
        const imageId = 'img-uuid-001';
        const primaryImage = createMockImage({ id: imageId, productId, isPrimary: true });
        const nextImage = createMockImage({
          id: 'img-002',
          productId,
          isPrimary: false,
          displayOrder: 1,
        });

        imageRepository.findOne
          .mockResolvedValueOnce(primaryImage)
          .mockResolvedValueOnce(nextImage);
        imageRepository.remove.mockResolvedValue(primaryImage);
        imageRepository.save.mockResolvedValue({ ...nextImage, isPrimary: true });

        await service.deleteImage(productId, imageId);

        expect(imageRepository.remove).toHaveBeenCalledWith(primaryImage);
        expect(imageRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'img-002',
            isPrimary: true,
          }),
        );
      });

      // Verifies a 404 error is thrown when l'image n'existe pas
      it('should throw 404 if image not found', async () => {
        imageRepository.findOne.mockResolvedValue(null);

        await expect(service.deleteImage('prod-001', 'non-existent')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'IMAGE_NOT_FOUND',
          }),
        });
      });
    });

    // setPrimaryImage tests
    describe('setPrimaryImage()', () => {
      // Verifies le changement de l'image primary
      it('should change primary image', async () => {
        const productId = 'prod-uuid-001';
        const imageId = 'img-uuid-002';
        const image = createMockImage({ id: imageId, productId, isPrimary: false });

        imageRepository.findOne.mockResolvedValue(image);
        imageRepository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
        imageRepository.save.mockResolvedValue({ ...image, isPrimary: true });

        const result = await service.setPrimaryImage(productId, imageId);

        expect(imageRepository.update).toHaveBeenCalledWith({ productId }, { isPrimary: false });
        expect(result.isPrimary).toBe(true);
      });

      // Verifies a 404 error is thrown when l'image n'existe pas
      it('should throw 404 if image not found', async () => {
        imageRepository.findOne.mockResolvedValue(null);

        await expect(service.setPrimaryImage('prod-001', 'non-existent')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'IMAGE_NOT_FOUND',
          }),
        });
      });
    });

    // reorderImages tests
    describe('reorderImages()', () => {
      // Verifies le reordonnancement des images selon l'ordre du tableau
      it('should reorder images according to array order', async () => {
        const productId = 'prod-uuid-001';
        const images = [
          createMockImage({ id: 'img-001', productId, displayOrder: 0 }),
          createMockImage({ id: 'img-002', productId, displayOrder: 1 }),
          createMockImage({ id: 'img-003', productId, displayOrder: 2 }),
        ];
        const product = createMockProduct({ id: productId, images });
        const imageIds = ['img-003', 'img-001', 'img-002'];

        productRepository.findOne.mockResolvedValue(product);
        imageRepository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
        imageRepository.find.mockResolvedValue(images);

        await service.reorderImages(productId, imageIds);

        expect(imageRepository.update).toHaveBeenCalledWith({ id: 'img-003' }, { displayOrder: 0 });
        expect(imageRepository.update).toHaveBeenCalledWith({ id: 'img-001' }, { displayOrder: 1 });
        expect(imageRepository.update).toHaveBeenCalledWith({ id: 'img-002' }, { displayOrder: 2 });
      });

      // Verifies an error is thrown when des IDs d'images invalides sont fournis
      it('should throw error if invalid image IDs provided', async () => {
        const productId = 'prod-uuid-001';
        const images = [createMockImage({ id: 'img-001', productId })];
        const product = createMockProduct({ id: productId, images });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.reorderImages(productId, ['invalid-id'])).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'INVALID_IMAGE_IDS',
          }),
        });
      });
    });
  });

  // ==================== findFeatured and findByCategory tests ====================
  describe('Specialized Queries', () => {
    // findFeatured tests
    describe('findFeatured()', () => {
      // Verifies returns des produits featured
      it('should return featured products limited by count', async () => {
        const featuredProducts = [
          createMockProduct({ isFeatured: true }),
          createMockProduct({ id: 'prod-002', isFeatured: true }),
        ];

        productRepository.find.mockResolvedValue(featuredProducts);

        const result = await service.findFeatured(5);

        expect(productRepository.find).toHaveBeenCalledWith({
          where: { isFeatured: true, isAvailable: true },
          relations: ['category', 'images'],
          order: { displayOrder: 'ASC' },
          take: 5,
        });
        expect(result).toHaveLength(2);
      });

      // Verifies the limite par defaut de 10
      it('should use default limit of 10', async () => {
        productRepository.find.mockResolvedValue([]);

        await service.findFeatured();

        expect(productRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
      });
    });

    // findByCategory tests
    describe('findByCategory()', () => {
      // Verifies le filtrage par categoryId
      it('should filter products by categoryId', async () => {
        const products = [createMockProduct()];

        queryBuilder.getManyAndCount.mockResolvedValue([products, 1]);

        const result = await service.findByCategory('cat-uuid-001', { page: 1, limit: 20 });

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.categoryId = :categoryId', {
          categoryId: 'cat-uuid-001',
        });
        expect(result.data).toHaveLength(1);
        expect(result.meta.total).toBe(1);
      });

      // Verifies le filtrage additionnel par isAvailable
      it('should apply isAvailable filter when specified', async () => {
        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findByCategory('cat-uuid-001', { isAvailable: true });

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isAvailable = :isAvailable', {
          isAvailable: true,
        });
      });
    });

    // search tests
    describe('search()', () => {
      // Verifies the recherche avec le terme
      it('should search products with ILIKE on name and description', async () => {
        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.search('security', { page: 1 });

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.nameFr ILIKE :search OR product.nameEn ILIKE :search OR product.descriptionFr ILIKE :search OR product.descriptionEn ILIKE :search)',
          { search: '%security%' },
        );
      });
    });
  });

  // ==================== Tests Product with Characteristics ====================
  describe('Product with Characteristics', () => {
    // Verifies the creation avec characteristics
    it('should create product with characteristics', async () => {
      const dto: CreateProductDto = {
        categoryId: 'cat-uuid-001',
        slug: 'test-char',
        sku: 'CHAR-001',
        nameFr: 'Test',
        nameEn: 'Test',
        descriptionFr: 'Desc',
        descriptionEn: 'Desc',
        productType: ProductType.SAAS,
        priceMonthly: 99,
        characteristics: [{ keyFr: 'Cle', keyEn: 'Key', valueFr: 'Valeur', valueEn: 'Value' }],
      };
      const mockProduct = createMockProduct({ slug: dto.slug });

      categoryRepository.findOne.mockResolvedValue(createMockCategory());
      productRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockProduct);
      productRepository.create.mockReturnValue(mockProduct);
      productRepository.save.mockResolvedValue(mockProduct);
      characteristicRepository.create.mockReturnValue({} as ProductCharacteristic);
      (characteristicRepository.save as jest.Mock).mockResolvedValue([]);

      await service.create(dto);

      expect(characteristicRepository.create).toHaveBeenCalled();
      expect(characteristicRepository.save).toHaveBeenCalled();
    });

    // Verifies the mise a jour avec remplacement des characteristics
    it('should update product and replace characteristics', async () => {
      const id = 'prod-uuid-001';
      const dto: UpdateProductDto = {
        characteristics: [{ keyFr: 'Nouvelle', keyEn: 'New', valueFr: 'Val', valueEn: 'Val' }],
      };
      const existingProduct = createMockProduct({ id });

      productRepository.findOne.mockResolvedValue(existingProduct);
      productRepository.save.mockResolvedValue(existingProduct);
      characteristicRepository.delete.mockResolvedValue({
        affected: 1,
      } as unknown as import('typeorm').DeleteResult);
      characteristicRepository.create.mockReturnValue({} as ProductCharacteristic);
      (characteristicRepository.save as jest.Mock).mockResolvedValue([]);

      await service.update(id, dto);

      expect(characteristicRepository.delete).toHaveBeenCalledWith({ productId: id });
      expect(characteristicRepository.create).toHaveBeenCalled();
    });

    // Verifies the suppression des characteristics sans remplacement
    it('should clear characteristics when empty array provided', async () => {
      const id = 'prod-uuid-001';
      const dto: UpdateProductDto = { characteristics: [] };
      const existingProduct = createMockProduct({ id });

      productRepository.findOne.mockResolvedValue(existingProduct);
      productRepository.save.mockResolvedValue(existingProduct);
      characteristicRepository.delete.mockResolvedValue({
        affected: 1,
      } as unknown as import('typeorm').DeleteResult);

      await service.update(id, dto);

      expect(characteristicRepository.delete).toHaveBeenCalledWith({ productId: id });
      expect(characteristicRepository.create).not.toHaveBeenCalled();
    });
  });

  // ==================== Tests Stock dans ProductService ====================
  describe('Stock Management (ProductService)', () => {
    // updateStock tests
    describe('updateStock()', () => {
      // Verifies stock update for a physical product
      it('should update stock for physical product', async () => {
        const productId = 'prod-uuid-001';
        const product = createMockProduct({
          id: productId,
          productType: ProductType.PHYSICAL,
          stockQuantity: 50,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 100 });

        await service.updateStock(productId, 100);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            stockQuantity: 100,
          }),
        );
      });

      // Verifies an error is thrown pour un produit non physical
      it('should throw error for non-physical product', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.updateStock('prod-001', 100)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'STOCK_NOT_APPLICABLE',
          }),
        });
      });
    });

    // getStockAlerts tests
    describe('getStockAlerts()', () => {
      // Verifies returns des produits avec stock <= seuil
      it('should return products with stock <= threshold', async () => {
        const lowStockProducts = [
          createMockProduct({
            stockQuantity: 5,
            stockAlertThreshold: 10,
            productType: ProductType.PHYSICAL,
          }),
        ];

        queryBuilder.getMany.mockResolvedValue(lowStockProducts);

        const result = await service.getStockAlerts();

        expect(queryBuilder.where).toHaveBeenCalledWith('product.productType = :type', {
          type: ProductType.PHYSICAL,
        });
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'product.stockQuantity <= product.stockAlertThreshold',
        );
        expect(result).toEqual(lowStockProducts);
      });
    });

    // checkStock tests
    describe('checkStock()', () => {
      // Verifies true is returned when stock is sufficient
      it('should return available true if stock is sufficient', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.checkStock('prod-001', 50);

        expect(result.available).toBe(true);
        expect(result.currentStock).toBe(100);
        expect(result.requestedQuantity).toBe(50);
      });

      // Verifies returns false when stock insuffisant
      it('should return available false if stock is insufficient', async () => {
        const product = createMockProduct({ productType: ProductType.PHYSICAL, stockQuantity: 10 });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.checkStock('prod-001', 50);

        expect(result.available).toBe(false);
      });

      // Verifies les produits non-physical retournent toujours available true
      it('should return available true for non-physical products', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.checkStock('prod-001', 999);

        expect(result.available).toBe(true);
        expect(result.currentStock).toBe(-1);
      });
    });

    // decrementStock tests
    describe('decrementStock()', () => {
      // Verifies the decrementation du stock
      it('should decrement stock for physical product', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 90 });

        await service.decrementStock('prod-001', 10);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 90 }),
        );
      });

      // Verifies l'erreur when stock insuffisant
      it('should throw INSUFFICIENT_STOCK if stock is insufficient', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 5,
        });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.decrementStock('prod-001', 10)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'INSUFFICIENT_STOCK',
          }),
        });
      });

      // Verifies l'erreur pour produit non-physical
      it('should throw error for non-physical product', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.decrementStock('prod-001', 10)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'STOCK_NOT_APPLICABLE',
          }),
        });
      });
    });

    // incrementStock tests
    describe('incrementStock()', () => {
      // Verifies l'incrementation du stock
      it('should increment stock for physical product', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 120 });

        await service.incrementStock('prod-001', 20);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 120 }),
        );
      });

      // Verifies l'erreur pour produit non-physical
      it('should throw error for non-physical product', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.incrementStock('prod-001', 20)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'STOCK_NOT_APPLICABLE',
          }),
        });
      });

      // Verifies l'erreur when produit non trouve
      it('should throw 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(service.incrementStock('non-existent', 10)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // decrementStock tests - product not found
    describe('decrementStock() - not found', () => {
      it('should throw 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(service.decrementStock('non-existent', 10)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });
  });

  // ==================== Tests Sorting ====================
  describe('Sorting', () => {
    // Verifies le tri par prix mensuel
    it('should sort by price_monthly', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.PRICE_MONTHLY, sortOrder: SortOrder.ASC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'product.priceMonthly',
        'ASC',
        'NULLS LAST',
      );
    });

    // Verifies le tri par prix unitaire
    it('should sort by price_unit', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.PRICE_UNIT, sortOrder: SortOrder.DESC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.priceUnit', 'DESC', 'NULLS LAST');
    });

    // Verifies le tri par date de creation
    it('should sort by created_at', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.CREATED_AT, sortOrder: SortOrder.DESC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
    });

    // Verifies le tri par defaut (display_order)
    it('should sort by display_order by default', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({});

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.displayOrder', 'ASC');
    });
  });

  // ==================== Admin variants ====================
  describe('findByIdAdmin()', () => {
    it('should return product without using cache', async () => {
      const product = createMockProduct({ id: 'p-1' });
      productRepository.findOne.mockResolvedValue(product);

      const result = await service.findByIdAdmin('p-1');

      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        relations: ['category', 'images', 'characteristics'],
      });
      expect(result).toEqual(product);
    });

    it('should throw RpcException 404 when product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });

  describe('findAllAdmin()', () => {
    it('should return all products paginated without using the cache', async () => {
      const products = [createMockProduct()];
      queryBuilder.getManyAndCount.mockResolvedValue([products, 1]);

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data).toEqual(products);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      // cache must NOT be consulted on admin path
      expect(mockCacheService.get).not.toHaveBeenCalled();
    });

    it('should default page/limit when not provided', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAllAdmin({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('findAll() — cached', () => {
    it('should return cached result without querying the repository', async () => {
      const cachedResult = {
        data: [createMockProduct({ id: 'cached-1' })],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockCacheService.get.mockResolvedValueOnce(cachedResult);

      const result = await service.findAll({});

      expect(result).toEqual(cachedResult);
      expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete()', () => {
    it('should soft-delete every valid product and report counts', async () => {
      const p1 = createMockProduct({ id: 'p1' });
      const p2 = createMockProduct({ id: 'p2' });
      productRepository.findOne.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
      productRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      const result = await service.bulkDelete(['p1', 'p2']);

      expect(productRepository.softDelete).toHaveBeenCalledTimes(2);
      expect(result.deletedCount).toBe(2);
      expect(result.failedIds).toEqual([]);
      expect(mockEventsPublisher.emitProductDeleted).toHaveBeenCalledTimes(2);
    });

    it('should record missing ids as failed and continue', async () => {
      productRepository.findOne
        .mockResolvedValueOnce(createMockProduct({ id: 'p1' }))
        .mockResolvedValueOnce(null); // p2 not found
      productRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      const result = await service.bulkDelete(['p1', 'p2']);

      expect(result.deletedCount).toBe(1);
      expect(result.failedIds).toEqual(['p2']);
    });

    it('should catch per-product errors and mark them as failed', async () => {
      productRepository.findOne.mockResolvedValueOnce(createMockProduct({ id: 'p1' }));
      productRepository.softDelete.mockRejectedValueOnce(new Error('db boom'));

      const result = await service.bulkDelete(['p1']);

      expect(result.deletedCount).toBe(0);
      expect(result.failedIds).toEqual(['p1']);
    });

    it('should not invalidate cache when nothing was deleted', async () => {
      productRepository.findOne.mockResolvedValueOnce(null);

      await service.bulkDelete(['unknown']);

      expect(mockCacheService.delByPattern).not.toHaveBeenCalled();
    });
  });

  describe('syncFeaturedFromTopProducts()', () => {
    it('should be a no-op when added and removed are both empty', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.syncFeaturedFromTopProducts('saas', [], []);

      expect(updateQb.execute).not.toHaveBeenCalled();
    });

    it('should update added ids to isFeatured=true', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.syncFeaturedFromTopProducts('saas', ['a', 'b'], []);

      expect(updateQb.set).toHaveBeenCalledWith({ isFeatured: true });
      expect(updateQb.execute).toHaveBeenCalledTimes(1);
    });

    it('should update removed ids to isFeatured=false', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.syncFeaturedFromTopProducts('saas', [], ['x']);

      expect(updateQb.set).toHaveBeenCalledWith({ isFeatured: false });
      expect(updateQb.execute).toHaveBeenCalledTimes(1);
    });

    it('should update both added and removed and invalidate cache', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.syncFeaturedFromTopProducts('saas', ['a'], ['b']);

      expect(updateQb.execute).toHaveBeenCalledTimes(2);
      expect(mockCacheService.delByPattern).toHaveBeenCalled();
    });
  });

  describe('findBySlug() — cached', () => {
    it('should return cached product without hitting the repository', async () => {
      const cached = createMockProduct({ slug: 'cached-product' });
      mockCacheService.get.mockResolvedValueOnce(cached);

      const result = await service.findBySlug('cached-product');

      expect(result).toEqual(cached);
      expect(productRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findById() — cached + not found', () => {
    it('should return cached product when cache hit', async () => {
      const cached = createMockProduct({ id: 'cached-id' });
      mockCacheService.get.mockResolvedValueOnce(cached);

      const result = await service.findById('cached-id');

      expect(result).toEqual(cached);
      expect(productRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw RpcException 404 when not found and cache miss', async () => {
      mockCacheService.get.mockResolvedValueOnce(undefined);
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });

  describe('findByCategory() — cached', () => {
    it('should return cached result without querying', async () => {
      const cachedResult = {
        data: [createMockProduct()],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockCacheService.get.mockResolvedValueOnce(cachedResult);

      const result = await service.findByCategory('cat-1', {});

      expect(result).toEqual(cachedResult);
      expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  describe('reorderImages() — not found', () => {
    it('should throw 404 when product does not exist', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.reorderImages('missing', ['i1'])).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });

  describe('updateStock() — not found', () => {
    it('should throw 404 when product does not exist', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.updateStock('missing', 10)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });

  describe('checkStock() — not found', () => {
    it('should throw 404 when product does not exist', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.checkStock('missing', 1)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });

  describe('onApplicationBootstrap()', () => {
    it('should reconcile featured products from content service snapshot', async () => {
      const reconcileSpy = jest
        .spyOn(service, 'reconcileFeaturedFromFullSync')
        .mockResolvedValue(undefined);
      contentClient.send.mockReturnValueOnce(
        of({ saasIds: ['s1'], physicalIds: ['p1'], licenseIds: [] }),
      );

      await service.onApplicationBootstrap();
      // wait microtasks for the fire-and-forget call to settle
      await new Promise((r) => setImmediate(r));

      expect(contentClient.send).toHaveBeenCalled();
      expect(reconcileSpy).toHaveBeenCalledWith(['s1'], ['p1'], []);
    });

    it('should default snapshot fields to empty arrays when missing', async () => {
      const reconcileSpy = jest
        .spyOn(service, 'reconcileFeaturedFromFullSync')
        .mockResolvedValue(undefined);
      contentClient.send.mockReturnValueOnce(of({}));

      await service.onApplicationBootstrap();
      await new Promise((r) => setImmediate(r));

      expect(reconcileSpy).toHaveBeenCalledWith([], [], []);
    });
  });

  describe('reconcileFeaturedFromFullSync()', () => {
    it('should turn on featured for given ids and turn off others', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.reconcileFeaturedFromFullSync(['s1'], ['p1'], ['l1']);

      // 1 call to turn on, 1 call to turn off the rest
      expect(updateQb.execute).toHaveBeenCalledTimes(2);
      expect(mockCacheService.delByPattern).toHaveBeenCalled();
    });

    it('should still issue the turn-off query when featuredIds is empty', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({} as UpdateResult),
      };
      (productRepository.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);

      await service.reconcileFeaturedFromFullSync([], [], []);

      // only the turn-off query runs
      expect(updateQb.execute).toHaveBeenCalledTimes(1);
    });
  });
});
