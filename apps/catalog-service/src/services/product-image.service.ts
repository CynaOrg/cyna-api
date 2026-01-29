import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { Product, ProductImage } from '../entities';
import {
  CreateProductImageDto,
  UpdateProductImageDto,
  ReorderImagesDto,
  ProductImageResponseDto,
  ProductImageAdminResponseDto,
} from '../dto';

@Injectable()
export class ProductImageService {
  constructor(
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('ProductImageService');
  }

  /**
   * Get all images for a product (public endpoint)
   */
  async getByProductId(
    productId: string,
    lang: Language = Language.FR,
  ): Promise<ProductImageResponseDto[]> {
    const images = await this.imageRepository.find({
      where: { productId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    return images.map((img) => ProductImageResponseDto.fromEntity(img, lang));
  }

  /**
   * Get all images for a product (admin endpoint)
   */
  async getByProductIdAdmin(productId: string): Promise<ProductImageAdminResponseDto[]> {
    const images = await this.imageRepository.find({
      where: { productId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    return images.map((img) => ProductImageAdminResponseDto.fromEntity(img));
  }

  /**
   * Add an image to a product
   */
  async create(
    productId: string,
    dto: CreateProductImageDto,
  ): Promise<ProductImageAdminResponseDto> {
    // Verify product exists
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // If this is set as primary, unset other primary images
    if (dto.isPrimary) {
      await this.imageRepository.update(
        { productId, isPrimary: true },
        { isPrimary: false },
      );
    }

    // Get max display order for this product
    const maxOrder = await this.imageRepository
      .createQueryBuilder('image')
      .where('image.product_id = :productId', { productId })
      .select('MAX(image.display_order)', 'max')
      .getRawOne();

    const displayOrder = dto.displayOrder ?? (maxOrder?.max ?? -1) + 1;

    const image = this.imageRepository.create({
      productId,
      imageUrl: dto.imageUrl,
      altTextFr: dto.altTextFr,
      altTextEn: dto.altTextEn,
      displayOrder,
      isPrimary: dto.isPrimary ?? false,
    });

    const savedImage = await this.imageRepository.save(image);

    this.logger.log(
      `Added image to product ${productId}: ${savedImage.id}`,
    );

    return ProductImageAdminResponseDto.fromEntity(savedImage);
  }

  /**
   * Update an image
   */
  async update(
    imageId: string,
    dto: UpdateProductImageDto,
  ): Promise<ProductImageAdminResponseDto> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new RpcException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    // If setting as primary, unset other primary images
    if (dto.isPrimary === true && !image.isPrimary) {
      await this.imageRepository.update(
        { productId: image.productId, isPrimary: true },
        { isPrimary: false },
      );
    }

    // Update fields
    if (dto.imageUrl !== undefined) image.imageUrl = dto.imageUrl;
    if (dto.altTextFr !== undefined) image.altTextFr = dto.altTextFr;
    if (dto.altTextEn !== undefined) image.altTextEn = dto.altTextEn;
    if (dto.displayOrder !== undefined) image.displayOrder = dto.displayOrder;
    if (dto.isPrimary !== undefined) image.isPrimary = dto.isPrimary;

    const updatedImage = await this.imageRepository.save(image);

    this.logger.log(`Updated image ${imageId}`);

    return ProductImageAdminResponseDto.fromEntity(updatedImage);
  }

  /**
   * Set an image as primary
   */
  async setPrimary(
    productId: string,
    imageId: string,
  ): Promise<ProductImageAdminResponseDto> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new RpcException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    // Unset other primary images
    await this.imageRepository.update(
      { productId, isPrimary: true },
      { isPrimary: false },
    );

    // Set this image as primary
    image.isPrimary = true;
    const updatedImage = await this.imageRepository.save(image);

    this.logger.log(`Set image ${imageId} as primary for product ${productId}`);

    return ProductImageAdminResponseDto.fromEntity(updatedImage);
  }

  /**
   * Reorder images for a product
   */
  async reorder(
    productId: string,
    dto: ReorderImagesDto,
  ): Promise<ProductImageAdminResponseDto[]> {
    // Verify all images belong to the product
    const images = await this.imageRepository.find({
      where: { productId, id: In(dto.imageIds) },
    });

    if (images.length !== dto.imageIds.length) {
      throw new RpcException({
        statusCode: 400,
        message: 'Some images do not belong to this product',
        code: 'INVALID_IMAGE_IDS',
      });
    }

    // Update display order based on array position
    const updates = dto.imageIds.map((id, index) => ({
      id,
      displayOrder: index,
    }));

    await Promise.all(
      updates.map((update) =>
        this.imageRepository.update(update.id, { displayOrder: update.displayOrder }),
      ),
    );

    this.logger.log(`Reordered ${dto.imageIds.length} images for product ${productId}`);

    // Return updated images
    return this.getByProductIdAdmin(productId);
  }

  /**
   * Delete an image
   */
  async delete(imageId: string): Promise<{ success: boolean; message: string }> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new RpcException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    const productId = image.productId;
    const wasPrimary = image.isPrimary;

    await this.imageRepository.delete(imageId);

    // If deleted image was primary, set first remaining image as primary
    if (wasPrimary) {
      const firstImage = await this.imageRepository.findOne({
        where: { productId },
        order: { displayOrder: 'ASC' },
      });

      if (firstImage) {
        firstImage.isPrimary = true;
        await this.imageRepository.save(firstImage);
      }
    }

    this.logger.log(`Deleted image ${imageId} from product ${productId}`);

    return {
      success: true,
      message: 'Image deleted successfully',
    };
  }

  /**
   * Get primary image for a product
   */
  async getPrimaryImage(
    productId: string,
    lang: Language = Language.FR,
  ): Promise<ProductImageResponseDto | null> {
    const image = await this.imageRepository.findOne({
      where: { productId, isPrimary: true },
    });

    if (!image) {
      // Fallback to first image
      const firstImage = await this.imageRepository.findOne({
        where: { productId },
        order: { displayOrder: 'ASC' },
      });

      if (!firstImage) return null;
      return ProductImageResponseDto.fromEntity(firstImage, lang);
    }

    return ProductImageResponseDto.fromEntity(image, lang);
  }
}
