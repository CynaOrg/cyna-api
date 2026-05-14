import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  CynaLoggerService,
  CynaCacheService,
  generateCacheKey,
  CACHE_PREFIXES,
  CACHE_KEYS,
} from '@cyna-api/common';
import { S3Service } from '@cyna-api/s3';
import { Product, ProductImage } from '../entities';
import { RequestUploadUrlDto, ConfirmUploadDto, PresignedUploadResponseDto } from '../dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

const MAX_IMAGES_PER_PRODUCT = 10;

@Injectable()
export class ImageService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
    private readonly s3Service: S3Service,
    private readonly cacheService: CynaCacheService,
    private readonly logger: CynaLoggerService,
  ) {}

  async requestUploadUrl(dto: RequestUploadUrlDto): Promise<PresignedUploadResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const imageCount = await this.imageRepository.count({
      where: { productId: dto.productId },
    });

    if (imageCount >= MAX_IMAGES_PER_PRODUCT) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.maxImagesReached',
        code: 'MAX_IMAGES_REACHED',
        details: { max: MAX_IMAGES_PER_PRODUCT },
      });
    }

    const extension =
      path.extname(dto.fileName).toLowerCase() || this.getExtensionFromMime(dto.contentType);
    const storageKey = `products/${dto.productId}/${uuidv4()}${extension}`;

    const { url, expiresAt } = await this.s3Service.generatePresignedPutUrl(
      storageKey,
      dto.contentType,
      900, // 15 minutes
    );

    const publicUrl = this.s3Service.getPublicUrl(storageKey);

    this.logger.log(`Presigned upload URL generated for product ${dto.productId}: ${storageKey}`);

    return {
      uploadUrl: url,
      storageKey,
      publicUrl,
      expiresAt,
    };
  }

  async confirmUpload(dto: ConfirmUploadDto): Promise<ProductImage> {
    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.productNotFound',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const expectedPrefix = `products/${dto.productId}/`;
    if (!dto.storageKey.startsWith(expectedPrefix)) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.invalidStorageKey',
        code: 'INVALID_STORAGE_KEY',
      });
    }

    const existingImages = await this.imageRepository.find({
      where: { productId: dto.productId },
      order: { displayOrder: 'ASC' },
    });

    if (existingImages.length >= MAX_IMAGES_PER_PRODUCT) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.catalog.maxImagesReached',
        code: 'MAX_IMAGES_REACHED',
        details: { max: MAX_IMAGES_PER_PRODUCT },
      });
    }

    let isPrimary = dto.isPrimary ?? false;

    // First image for product is always primary
    if (existingImages.length === 0) {
      isPrimary = true;
    }

    // If setting as primary, unset all others
    if (isPrimary && existingImages.length > 0) {
      await this.imageRepository.update({ productId: dto.productId }, { isPrimary: false });
    }

    const maxDisplayOrder =
      existingImages.length > 0 ? Math.max(...existingImages.map((img) => img.displayOrder)) : -1;

    const publicUrl = this.s3Service.getPublicUrl(dto.storageKey);

    const image = this.imageRepository.create({
      productId: dto.productId,
      imageUrl: publicUrl,
      storageKey: dto.storageKey,
      fileSize: dto.fileSizeBytes,
      mimeType: dto.mimeType,
      altTextFr: dto.altTextFr,
      altTextEn: dto.altTextEn,
      isPrimary,
      displayOrder: maxDisplayOrder + 1,
    });

    const saved = await this.imageRepository.save(image);

    await this.invalidateProductCache(dto.productId);

    this.logger.log(`Image confirmed for product ${dto.productId}: ${saved.id}`);

    return saved;
  }

  async deleteImage(productId: string, imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.catalog.imageNotFound',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    // Delete from R2 if storageKey exists
    if (image.storageKey) {
      try {
        await this.s3Service.deleteObject(image.storageKey);
        this.logger.log(`Deleted from R2: ${image.storageKey}`);
      } catch (error) {
        this.logger.warn(`Failed to delete from R2: ${image.storageKey}`, error);
      }
    }

    const wasPrimary = image.isPrimary;

    await this.imageRepository.remove(image);

    // If deleted image was primary, promote the next one
    if (wasPrimary) {
      const nextImage = await this.imageRepository.findOne({
        where: { productId },
        order: { displayOrder: 'ASC' },
      });

      if (nextImage) {
        nextImage.isPrimary = true;
        await this.imageRepository.save(nextImage);
        this.logger.log(`Promoted image ${nextImage.id} to primary for product ${productId}`);
      }
    }

    await this.invalidateProductCache(productId);

    this.logger.log(`Deleted image ${imageId} from product ${productId}`);
  }

  private async invalidateProductCache(productId: string): Promise<void> {
    await this.cacheService.del(generateCacheKey.productById(productId));
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.PRODUCT}list:*`);
    await this.cacheService.delByPattern(`${CACHE_KEYS.PRODUCTS_FEATURED}*`);
  }

  private getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimeType] || '.jpg';
  }
}
