import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { Product, ProductCharacteristic } from '../entities';
import {
  CreateProductCharacteristicDto,
  UpdateProductCharacteristicDto,
  BulkCharacteristicsDto,
  ReorderCharacteristicsDto,
  ProductCharacteristicResponseDto,
  ProductCharacteristicAdminResponseDto,
} from '../dto';

@Injectable()
export class ProductCharacteristicService {
  constructor(
    @InjectRepository(ProductCharacteristic)
    private readonly characteristicRepository: Repository<ProductCharacteristic>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('ProductCharacteristicService');
  }

  /**
   * Get all characteristics for a product (public endpoint)
   */
  async getByProductId(
    productId: string,
    lang: Language = Language.FR,
  ): Promise<ProductCharacteristicResponseDto[]> {
    const characteristics = await this.characteristicRepository.find({
      where: { productId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    return characteristics.map((char) =>
      ProductCharacteristicResponseDto.fromEntity(char, lang),
    );
  }

  /**
   * Get all characteristics for a product (admin endpoint)
   */
  async getByProductIdAdmin(
    productId: string,
  ): Promise<ProductCharacteristicAdminResponseDto[]> {
    const characteristics = await this.characteristicRepository.find({
      where: { productId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });

    return characteristics.map((char) =>
      ProductCharacteristicAdminResponseDto.fromEntity(char),
    );
  }

  /**
   * Add a characteristic to a product
   */
  async create(
    productId: string,
    dto: CreateProductCharacteristicDto,
  ): Promise<ProductCharacteristicAdminResponseDto> {
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

    // Get max display order for this product
    const maxOrder = await this.characteristicRepository
      .createQueryBuilder('char')
      .where('char.product_id = :productId', { productId })
      .select('MAX(char.display_order)', 'max')
      .getRawOne();

    const displayOrder = dto.displayOrder ?? (maxOrder?.max ?? -1) + 1;

    const characteristic = this.characteristicRepository.create({
      productId,
      keyFr: dto.keyFr,
      keyEn: dto.keyEn,
      valueFr: dto.valueFr,
      valueEn: dto.valueEn,
      displayOrder,
    });

    const savedCharacteristic = await this.characteristicRepository.save(characteristic);

    this.logger.log(
      `Added characteristic to product ${productId}: ${savedCharacteristic.id}`,
    );

    return ProductCharacteristicAdminResponseDto.fromEntity(savedCharacteristic);
  }

  /**
   * Update a characteristic
   */
  async update(
    characteristicId: string,
    dto: UpdateProductCharacteristicDto,
  ): Promise<ProductCharacteristicAdminResponseDto> {
    const characteristic = await this.characteristicRepository.findOne({
      where: { id: characteristicId },
    });

    if (!characteristic) {
      throw new RpcException({
        statusCode: 404,
        message: 'Characteristic not found',
        code: 'CHARACTERISTIC_NOT_FOUND',
      });
    }

    // Update fields
    if (dto.keyFr !== undefined) characteristic.keyFr = dto.keyFr;
    if (dto.keyEn !== undefined) characteristic.keyEn = dto.keyEn;
    if (dto.valueFr !== undefined) characteristic.valueFr = dto.valueFr;
    if (dto.valueEn !== undefined) characteristic.valueEn = dto.valueEn;
    if (dto.displayOrder !== undefined) characteristic.displayOrder = dto.displayOrder;

    const updatedCharacteristic = await this.characteristicRepository.save(characteristic);

    this.logger.log(`Updated characteristic ${characteristicId}`);

    return ProductCharacteristicAdminResponseDto.fromEntity(updatedCharacteristic);
  }

  /**
   * Bulk create/update characteristics for a product
   * This replaces all existing characteristics
   */
  async bulkUpsert(
    productId: string,
    dto: BulkCharacteristicsDto,
  ): Promise<ProductCharacteristicAdminResponseDto[]> {
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

    // Delete all existing characteristics
    await this.characteristicRepository.delete({ productId });

    if (dto.characteristics.length === 0) {
      this.logger.log(`Cleared all characteristics for product ${productId}`);
      return [];
    }

    // Create new characteristics
    const characteristics = dto.characteristics.map((charDto, index) =>
      this.characteristicRepository.create({
        productId,
        keyFr: charDto.keyFr,
        keyEn: charDto.keyEn,
        valueFr: charDto.valueFr,
        valueEn: charDto.valueEn,
        displayOrder: charDto.displayOrder ?? index,
      }),
    );

    const savedCharacteristics = await this.characteristicRepository.save(characteristics);

    this.logger.log(
      `Bulk updated ${savedCharacteristics.length} characteristics for product ${productId}`,
    );

    return savedCharacteristics.map((char) =>
      ProductCharacteristicAdminResponseDto.fromEntity(char),
    );
  }

  /**
   * Reorder characteristics for a product
   */
  async reorder(
    productId: string,
    dto: ReorderCharacteristicsDto,
  ): Promise<ProductCharacteristicAdminResponseDto[]> {
    // Verify all characteristics belong to the product
    const characteristics = await this.characteristicRepository.find({
      where: { productId, id: In(dto.characteristicIds) },
    });

    if (characteristics.length !== dto.characteristicIds.length) {
      throw new RpcException({
        statusCode: 400,
        message: 'Some characteristics do not belong to this product',
        code: 'INVALID_CHARACTERISTIC_IDS',
      });
    }

    // Update display order based on array position
    const updates = dto.characteristicIds.map((id, index) => ({
      id,
      displayOrder: index,
    }));

    await Promise.all(
      updates.map((update) =>
        this.characteristicRepository.update(update.id, {
          displayOrder: update.displayOrder,
        }),
      ),
    );

    this.logger.log(
      `Reordered ${dto.characteristicIds.length} characteristics for product ${productId}`,
    );

    // Return updated characteristics
    return this.getByProductIdAdmin(productId);
  }

  /**
   * Delete a characteristic
   */
  async delete(characteristicId: string): Promise<{ success: boolean; message: string }> {
    const characteristic = await this.characteristicRepository.findOne({
      where: { id: characteristicId },
    });

    if (!characteristic) {
      throw new RpcException({
        statusCode: 404,
        message: 'Characteristic not found',
        code: 'CHARACTERISTIC_NOT_FOUND',
      });
    }

    await this.characteristicRepository.delete(characteristicId);

    this.logger.log(
      `Deleted characteristic ${characteristicId} from product ${characteristic.productId}`,
    );

    return {
      success: true,
      message: 'Characteristic deleted successfully',
    };
  }
}
