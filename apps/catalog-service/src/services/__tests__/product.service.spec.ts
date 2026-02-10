import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { ProductService, PaginatedResult } from '../product.service';
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

// Mock du logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock de l'event publisher
const mockEventsPublisher = {
  emitProductCreated: jest.fn(),
  emitProductUpdated: jest.fn(),
  emitProductDeleted: jest.fn(),
};

// Mock du cache service
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPattern: jest.fn(),
  getOrSet: jest.fn(),
  invalidateDomain: jest.fn(),
  reset: jest.fn(),
};

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

// Fixture: produit de base pour les tests
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

// Fixture: image produit
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

// Tests du ProductService
describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let characteristicRepository: jest.Mocked<Repository<ProductCharacteristic>>;
  let imageRepository: jest.Mocked<Repository<ProductImage>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<Product>>;

  beforeEach(async () => {
    // Mock du QueryBuilder pour les requetes complexes
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
    // Tests de creation de produit
    describe('create()', () => {
      // Verifie la creation d'un produit SaaS avec priceMonthly et priceYearly
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

      // Verifie la creation d'un produit physical avec priceUnit et stockQuantity
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

      // Verifie la creation d'un produit license avec priceUnit sans stock
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

      // Verifie qu'une erreur est levee si la categorie n'existe pas
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

      // Verifie qu'une erreur est levee si le slug existe deja
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

      // Verifie qu'une erreur est levee si le SKU existe deja
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

    // Tests de recherche de tous les produits
    describe('findAll()', () => {
      // Verifie la pagination correcte
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

      // Verifie le filtrage par categorySlug
      it('should filter by categorySlug', async () => {
        const query: ProductQueryDto = { categorySlug: 'services' };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('category.slug = :categorySlug', {
          categorySlug: 'services',
        });
      });

      // Verifie le filtrage par productType
      it('should filter by productType', async () => {
        const query: ProductQueryDto = { productType: ProductType.SAAS };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.productType = :productType', {
          productType: ProductType.SAAS,
        });
      });

      // Verifie le filtrage par isAvailable
      it('should filter by isAvailable', async () => {
        const query: ProductQueryDto = { isAvailable: true };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isAvailable = :isAvailable', {
          isAvailable: true,
        });
      });

      // Verifie le filtrage par isFeatured
      it('should filter by isFeatured', async () => {
        const query: ProductQueryDto = { isFeatured: true };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isFeatured = :isFeatured', {
          isFeatured: true,
        });
      });

      // Verifie le filtrage par minPrice
      it('should filter by minPrice', async () => {
        const query: ProductQueryDto = { minPrice: 100 };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.priceMonthly >= :minPrice OR product.priceUnit >= :minPrice)',
          { minPrice: 100 },
        );
      });

      // Verifie le filtrage par maxPrice
      it('should filter by maxPrice', async () => {
        const query: ProductQueryDto = { maxPrice: 500 };

        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll(query);

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(product.priceMonthly <= :maxPrice OR product.priceUnit <= :maxPrice)',
          { maxPrice: 500 },
        );
      });

      // Verifie la recherche texte avec ILIKE sur nom et description
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

    // Tests de recherche par slug
    describe('findBySlug()', () => {
      // Verifie qu'un produit avec toutes ses relations est retourne
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

      // Verifie qu'une erreur 404 est levee si le produit n'existe pas
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

    // Tests de mise a jour
    describe('update()', () => {
      // Verifie la mise a jour d'un produit
      it('should update a product', async () => {
        const id = 'prod-uuid-001';
        const dto: UpdateProductDto = { nameFr: 'Updated Name' };
        const existingProduct = createMockProduct({ id });
        const updatedProduct = createMockProduct({ id, nameFr: 'Updated Name' });

        productRepository.findOne.mockResolvedValue(existingProduct);
        productRepository.save.mockResolvedValue(updatedProduct);

        const result = await service.update(id, dto);

        expect(productRepository.save).toHaveBeenCalled();
        expect(mockEventsPublisher.emitProductUpdated).toHaveBeenCalled();
      });

      // Verifie qu'une erreur est levee si le nouveau slug existe deja
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
    });

    // Tests de suppression
    describe('delete()', () => {
      // Verifie la suppression d'un produit
      it('should delete a product', async () => {
        const id = 'prod-uuid-001';
        const product = createMockProduct({ id });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.remove.mockResolvedValue(product);

        await service.delete(id);

        expect(productRepository.remove).toHaveBeenCalledWith(product);
        expect(mockEventsPublisher.emitProductDeleted).toHaveBeenCalled();
      });

      // Verifie qu'une erreur 404 est levee si le produit n'existe pas
      it('should throw 404 if product not found', async () => {
        productRepository.findOne.mockResolvedValue(null);

        await expect(service.delete('non-existent')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });
  });

  // ==================== Tests IMAGE Management ====================
  describe('Image Management', () => {
    // Tests d'ajout d'image
    describe('addImage()', () => {
      // Verifie que la premiere image devient automatiquement primary
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

      // Verifie que si isPrimary=true, les autres images passent a false
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

      // Verifie qu'une erreur 404 est levee si le produit n'existe pas
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

    // Tests de suppression d'image
    describe('deleteImage()', () => {
      // Verifie la suppression d'une image et la reassignation du primary si necessaire
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

      // Verifie qu'une erreur 404 est levee si l'image n'existe pas
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

    // Tests de setPrimaryImage
    describe('setPrimaryImage()', () => {
      // Verifie le changement de l'image primary
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

      // Verifie qu'une erreur 404 est levee si l'image n'existe pas
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

    // Tests de reorderImages
    describe('reorderImages()', () => {
      // Verifie le reordonnancement des images selon l'ordre du tableau
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

      // Verifie qu'une erreur est levee si des IDs d'images invalides sont fournis
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

  // ==================== Tests findFeatured et findByCategory ====================
  describe('Specialized Queries', () => {
    // Tests de findFeatured
    describe('findFeatured()', () => {
      // Verifie le retour des produits featured
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

      // Verifie la limite par defaut de 10
      it('should use default limit of 10', async () => {
        productRepository.find.mockResolvedValue([]);

        await service.findFeatured();

        expect(productRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
      });
    });

    // Tests de findByCategory
    describe('findByCategory()', () => {
      // Verifie le filtrage par categoryId
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

      // Verifie le filtrage additionnel par isAvailable
      it('should apply isAvailable filter when specified', async () => {
        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findByCategory('cat-uuid-001', { isAvailable: true });

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.isAvailable = :isAvailable', {
          isAvailable: true,
        });
      });
    });

    // Tests de search
    describe('search()', () => {
      // Verifie la recherche avec le terme
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
    // Verifie la creation avec characteristics
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

    // Verifie la mise a jour avec remplacement des characteristics
    it('should update product and replace characteristics', async () => {
      const id = 'prod-uuid-001';
      const dto: UpdateProductDto = {
        characteristics: [{ keyFr: 'Nouvelle', keyEn: 'New', valueFr: 'Val', valueEn: 'Val' }],
      };
      const existingProduct = createMockProduct({ id });

      productRepository.findOne.mockResolvedValue(existingProduct);
      productRepository.save.mockResolvedValue(existingProduct);
      characteristicRepository.delete.mockResolvedValue({ affected: 1 } as any);
      characteristicRepository.create.mockReturnValue({} as ProductCharacteristic);
      (characteristicRepository.save as jest.Mock).mockResolvedValue([]);

      await service.update(id, dto);

      expect(characteristicRepository.delete).toHaveBeenCalledWith({ productId: id });
      expect(characteristicRepository.create).toHaveBeenCalled();
    });

    // Verifie la suppression des characteristics sans remplacement
    it('should clear characteristics when empty array provided', async () => {
      const id = 'prod-uuid-001';
      const dto: UpdateProductDto = { characteristics: [] };
      const existingProduct = createMockProduct({ id });

      productRepository.findOne.mockResolvedValue(existingProduct);
      productRepository.save.mockResolvedValue(existingProduct);
      characteristicRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.update(id, dto);

      expect(characteristicRepository.delete).toHaveBeenCalledWith({ productId: id });
      expect(characteristicRepository.create).not.toHaveBeenCalled();
    });
  });

  // ==================== Tests Stock dans ProductService ====================
  describe('Stock Management (ProductService)', () => {
    // Tests de updateStock
    describe('updateStock()', () => {
      // Verifie la mise a jour du stock d'un produit physical
      it('should update stock for physical product', async () => {
        const productId = 'prod-uuid-001';
        const product = createMockProduct({
          id: productId,
          productType: ProductType.PHYSICAL,
          stockQuantity: 50,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 100 });

        const result = await service.updateStock(productId, 100);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            stockQuantity: 100,
          }),
        );
      });

      // Verifie qu'une erreur est levee pour un produit non physical
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

    // Tests de getStockAlerts
    describe('getStockAlerts()', () => {
      // Verifie le retour des produits avec stock <= seuil
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

    // Tests de checkStock
    describe('checkStock()', () => {
      // Verifie le retour true si stock suffisant
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

      // Verifie le retour false si stock insuffisant
      it('should return available false if stock is insufficient', async () => {
        const product = createMockProduct({ productType: ProductType.PHYSICAL, stockQuantity: 10 });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.checkStock('prod-001', 50);

        expect(result.available).toBe(false);
      });

      // Verifie que les produits non-physical retournent toujours available true
      it('should return available true for non-physical products', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.checkStock('prod-001', 999);

        expect(result.available).toBe(true);
        expect(result.currentStock).toBe(-1);
      });
    });

    // Tests de decrementStock
    describe('decrementStock()', () => {
      // Verifie la decrementation du stock
      it('should decrement stock for physical product', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 90 });

        const result = await service.decrementStock('prod-001', 10);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 90 }),
        );
      });

      // Verifie l'erreur si stock insuffisant
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

      // Verifie l'erreur pour produit non-physical
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

    // Tests de incrementStock
    describe('incrementStock()', () => {
      // Verifie l'incrementation du stock
      it('should increment stock for physical product', async () => {
        const product = createMockProduct({
          productType: ProductType.PHYSICAL,
          stockQuantity: 100,
        });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 120 });

        const result = await service.incrementStock('prod-001', 20);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 120 }),
        );
      });

      // Verifie l'erreur pour produit non-physical
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

      // Verifie l'erreur si produit non trouve
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

    // Tests de decrementStock - product not found
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
    // Verifie le tri par prix mensuel
    it('should sort by price_monthly', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.PRICE_MONTHLY, sortOrder: SortOrder.ASC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'product.priceMonthly',
        'ASC',
        'NULLS LAST',
      );
    });

    // Verifie le tri par prix unitaire
    it('should sort by price_unit', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.PRICE_UNIT, sortOrder: SortOrder.DESC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.priceUnit', 'DESC', 'NULLS LAST');
    });

    // Verifie le tri par date de creation
    it('should sort by created_at', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sortBy: ProductSortBy.CREATED_AT, sortOrder: SortOrder.DESC });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
    });

    // Verifie le tri par defaut (display_order)
    it('should sort by display_order by default', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({});

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.displayOrder', 'ASC');
    });
  });
});
