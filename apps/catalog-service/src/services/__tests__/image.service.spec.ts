import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageService } from '../image.service';
import { Product, ProductImage, ProductType } from '../../entities';
import { S3Service } from '@cyna-api/s3';
import { CynaLoggerService, CynaCacheService } from '@cyna-api/common';

// Logger mock
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// S3Service mock
const mockS3Service = {
  generatePresignedPutUrl: jest.fn(),
  deleteObject: jest.fn(),
  getPublicUrl: jest.fn(),
};

// Fixture: base product
const createMockProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod-uuid-001',
    categoryId: 'cat-uuid-001',
    slug: 'soc-premium',
    sku: 'SOC-001',
    nameFr: 'SOC Premium',
    nameEn: 'SOC Premium',
    descriptionFr: 'Description FR',
    descriptionEn: 'Description EN',
    productType: ProductType.SAAS,
    isAvailable: true,
    isFeatured: false,
    displayOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    images: [],
    characteristics: [],
    stockReservations: [],
    ...overrides,
  }) as Product;

// Fixture: product image
const createMockImage = (overrides: Partial<ProductImage> = {}): ProductImage =>
  ({
    id: 'img-uuid-001',
    productId: 'prod-uuid-001',
    imageUrl: 'https://pub-abc.r2.dev/products/prod-uuid-001/image.jpg',
    altTextFr: 'Alt FR',
    altTextEn: 'Alt EN',
    displayOrder: 0,
    isPrimary: true,
    storageKey: 'products/prod-uuid-001/image.jpg',
    fileSize: 2048000,
    mimeType: 'image/jpeg',
    createdAt: new Date('2024-01-01'),
    product: {} as Product,
    ...overrides,
  }) as ProductImage;

describe('ImageService', () => {
  let service: ImageService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let imageRepository: jest.Mocked<Repository<ProductImage>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: CynaCacheService,
          useValue: {
            del: jest.fn().mockResolvedValue(undefined),
            delByPattern: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ImageService>(ImageService);
    productRepository = module.get(getRepositoryToken(Product));
    imageRepository = module.get(getRepositoryToken(ProductImage));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== requestUploadUrl ====================
  describe('requestUploadUrl', () => {
    it('should return presigned URL with correct key format on success', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        fileName: 'hero.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 2048000,
      };
      productRepository.findOne.mockResolvedValue(createMockProduct({ id: dto.productId }));
      imageRepository.count.mockResolvedValue(0);
      mockS3Service.generatePresignedPutUrl.mockResolvedValue({
        url: 'https://r2.example.com/presigned-url',
        expiresAt: new Date('2026-02-13T12:30:00Z'),
      });
      mockS3Service.getPublicUrl.mockReturnValue(
        'https://pub-abc.r2.dev/products/prod-uuid-001/uuid.jpg',
      );

      // Act
      const result = await service.requestUploadUrl(dto);

      // Assert
      expect(result.uploadUrl).toBe('https://r2.example.com/presigned-url');
      expect(result.storageKey).toMatch(/^products\/prod-uuid-001\//);
      expect(result.storageKey).toMatch(/\.jpg$/);
      expect(result.publicUrl).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { id: dto.productId },
      });
      expect(mockS3Service.generatePresignedPutUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^products\/prod-uuid-001\//),
        'image/jpeg',
        900,
      );
    });

    it('should throw RpcException with 404 when product does not exist', async () => {
      // Arrange
      const dto = {
        productId: 'non-existent',
        fileName: 'hero.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 2048000,
      };
      productRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.requestUploadUrl(dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });

    it('should throw RpcException with 400 when image limit (10) is reached', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        fileName: 'hero.jpg',
        contentType: 'image/jpeg',
        fileSizeBytes: 2048000,
      };
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.count.mockResolvedValue(10);

      // Act & Assert
      await expect(service.requestUploadUrl(dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 400,
          code: 'MAX_IMAGES_REACHED',
        }),
      });
    });

    it('should generate correct extension from fileName', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        fileName: 'photo.png',
        contentType: 'image/png',
        fileSizeBytes: 1024000,
      };
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.count.mockResolvedValue(0);
      mockS3Service.generatePresignedPutUrl.mockResolvedValue({
        url: 'https://r2.example.com/presigned-url',
        expiresAt: new Date('2026-02-13T12:30:00Z'),
      });
      mockS3Service.getPublicUrl.mockReturnValue('https://pub-abc.r2.dev/key');

      // Act
      const result = await service.requestUploadUrl(dto);

      // Assert
      expect(result.storageKey).toMatch(/\.png$/);
    });

    it('should fall back to mime-based extension when fileName has no extension', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        fileName: 'photo',
        contentType: 'image/webp',
        fileSizeBytes: 1024000,
      };
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.count.mockResolvedValue(0);
      mockS3Service.generatePresignedPutUrl.mockResolvedValue({
        url: 'https://r2.example.com/presigned-url',
        expiresAt: new Date('2026-02-13T12:30:00Z'),
      });
      mockS3Service.getPublicUrl.mockReturnValue('https://pub-abc.r2.dev/key');

      // Act
      const result = await service.requestUploadUrl(dto);

      // Assert
      expect(result.storageKey).toMatch(/\.webp$/);
    });
  });

  // ==================== confirmUpload ====================
  describe('confirmUpload', () => {
    it('should create ProductImage with correct fields on success', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        storageKey: 'products/prod-uuid-001/uuid.jpg',
        altTextFr: 'Image principale',
        altTextEn: 'Main image',
        isPrimary: false,
        fileSizeBytes: 2048000,
        mimeType: 'image/jpeg',
      };
      const existingImage = createMockImage({ displayOrder: 0, isPrimary: true });
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.find.mockResolvedValue([existingImage]);
      mockS3Service.getPublicUrl.mockReturnValue(
        'https://pub-abc.r2.dev/products/prod-uuid-001/uuid.jpg',
      );
      const createdImage = createMockImage({
        storageKey: dto.storageKey,
        altTextFr: dto.altTextFr,
        altTextEn: dto.altTextEn,
        isPrimary: false,
        displayOrder: 1,
      });
      imageRepository.create.mockReturnValue(createdImage);
      imageRepository.save.mockResolvedValue(createdImage);

      // Act
      const result = await service.confirmUpload(dto);

      // Assert
      expect(result).toBeDefined();
      expect(imageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: dto.productId,
          storageKey: dto.storageKey,
          altTextFr: dto.altTextFr,
          altTextEn: dto.altTextEn,
          isPrimary: false,
          displayOrder: 1,
          imageUrl: 'https://pub-abc.r2.dev/products/prod-uuid-001/uuid.jpg',
        }),
      );
      expect(imageRepository.save).toHaveBeenCalled();
    });

    it('should set isPrimary=true when it is the first image for a product', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        storageKey: 'products/prod-uuid-001/uuid.jpg',
        isPrimary: false,
      };
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.find.mockResolvedValue([]); // no existing images
      mockS3Service.getPublicUrl.mockReturnValue(
        'https://pub-abc.r2.dev/products/prod-uuid-001/uuid.jpg',
      );
      const createdImage = createMockImage({ isPrimary: true, displayOrder: 0 });
      imageRepository.create.mockReturnValue(createdImage);
      imageRepository.save.mockResolvedValue(createdImage);

      // Act
      await service.confirmUpload(dto);

      // Assert
      expect(imageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isPrimary: true,
          displayOrder: 0,
        }),
      );
    });

    it('should unset other images isPrimary when isPrimary=true', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        storageKey: 'products/prod-uuid-001/uuid.jpg',
        isPrimary: true,
      };
      const existingImages = [
        createMockImage({ id: 'img-001', displayOrder: 0, isPrimary: true }),
        createMockImage({ id: 'img-002', displayOrder: 1, isPrimary: false }),
      ];
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.find.mockResolvedValue(existingImages);
      mockS3Service.getPublicUrl.mockReturnValue(
        'https://pub-abc.r2.dev/products/prod-uuid-001/uuid.jpg',
      );
      const createdImage = createMockImage({ isPrimary: true });
      imageRepository.create.mockReturnValue(createdImage);
      imageRepository.save.mockResolvedValue(createdImage);

      // Act
      await service.confirmUpload(dto);

      // Assert
      expect(imageRepository.update).toHaveBeenCalledWith(
        { productId: 'prod-uuid-001' },
        { isPrimary: false },
      );
    });

    it('should throw RpcException with 400 when storageKey does not match product', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        storageKey: 'products/different-product/uuid.jpg',
      };
      productRepository.findOne.mockResolvedValue(createMockProduct());

      // Act & Assert
      await expect(service.confirmUpload(dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_STORAGE_KEY',
        }),
      });
    });

    it('should throw RpcException with 400 when image limit is reached', async () => {
      // Arrange
      const dto = {
        productId: 'prod-uuid-001',
        storageKey: 'products/prod-uuid-001/uuid.jpg',
      };
      const tenImages = Array.from({ length: 10 }, (_, i) =>
        createMockImage({ id: `img-${i}`, displayOrder: i }),
      );
      productRepository.findOne.mockResolvedValue(createMockProduct());
      imageRepository.find.mockResolvedValue(tenImages);

      // Act & Assert
      await expect(service.confirmUpload(dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 400,
          code: 'MAX_IMAGES_REACHED',
        }),
      });
    });
  });

  // ==================== deleteImage ====================
  describe('deleteImage', () => {
    it('should delete from both R2 and database on success', async () => {
      // Arrange
      const productId = 'prod-uuid-001';
      const imageId = 'img-uuid-001';
      const image = createMockImage({
        id: imageId,
        productId,
        isPrimary: false,
        storageKey: 'products/prod-uuid-001/image.jpg',
      });
      imageRepository.findOne.mockResolvedValue(image);
      imageRepository.remove.mockResolvedValue(image);
      mockS3Service.deleteObject.mockResolvedValue(undefined);

      // Act
      await service.deleteImage(productId, imageId);

      // Assert
      expect(mockS3Service.deleteObject).toHaveBeenCalledWith('products/prod-uuid-001/image.jpg');
      expect(imageRepository.remove).toHaveBeenCalledWith(image);
    });

    it('should throw RpcException with 404 when image does not exist', async () => {
      // Arrange
      imageRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteImage('prod-uuid-001', 'non-existent')).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'IMAGE_NOT_FOUND',
        }),
      });
    });

    it('should promote next image to primary when deleting the primary image', async () => {
      // Arrange
      const productId = 'prod-uuid-001';
      const imageId = 'img-uuid-001';
      const primaryImage = createMockImage({
        id: imageId,
        productId,
        isPrimary: true,
        storageKey: 'products/prod-uuid-001/primary.jpg',
      });
      const nextImage = createMockImage({
        id: 'img-uuid-002',
        productId,
        isPrimary: false,
        displayOrder: 1,
      });
      imageRepository.findOne
        .mockResolvedValueOnce(primaryImage) // find the image to delete
        .mockResolvedValueOnce(nextImage); // find next image for promotion
      imageRepository.remove.mockResolvedValue(primaryImage);
      imageRepository.save.mockResolvedValue({ ...nextImage, isPrimary: true } as ProductImage);
      mockS3Service.deleteObject.mockResolvedValue(undefined);

      // Act
      await service.deleteImage(productId, imageId);

      // Assert
      expect(imageRepository.remove).toHaveBeenCalledWith(primaryImage);
      expect(imageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'img-uuid-002',
          isPrimary: true,
        }),
      );
    });

    it('should skip R2 deletion when image has no storageKey (legacy)', async () => {
      // Arrange
      const productId = 'prod-uuid-001';
      const imageId = 'img-uuid-001';
      const legacyImage = createMockImage({
        id: imageId,
        productId,
        isPrimary: false,
        storageKey: undefined,
      });
      imageRepository.findOne.mockResolvedValue(legacyImage);
      imageRepository.remove.mockResolvedValue(legacyImage);

      // Act
      await service.deleteImage(productId, imageId);

      // Assert
      expect(mockS3Service.deleteObject).not.toHaveBeenCalled();
      expect(imageRepository.remove).toHaveBeenCalledWith(legacyImage);
    });
  });
});
