import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  CynaLoggerService,
  CynaCacheService,
  CACHE_PREFIXES,
  CACHE_TTL,
  BillingPeriod,
} from '@cyna-api/common';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { AddCartItemDto, UpdateCartItemDto, MergeCartDto } from '../dto';

@Injectable()
export class CartService {
  private readonly CATALOG_TIMEOUT = 5000;

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
  ) {}

  private cartCacheKey(userId: string): string {
    return `${CACHE_PREFIXES.CART}${userId}`;
  }

  private async invalidateCartCache(userId: string): Promise<void> {
    await this.cacheService.del(this.cartCacheKey(userId));
  }

  private async getProductFromCatalog(productId: string): Promise<any | null> {
    try {
      return await firstValueFrom(
        this.catalogClient
          .send(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: productId })
          .pipe(
            timeout(this.CATALOG_TIMEOUT),
            catchError((err) => {
              this.logger.warn(
                `Failed to fetch product ${productId} from catalog: ${err.message || err}`,
              );
              return of(null);
            }),
          ),
      );
    } catch {
      return null;
    }
  }

  async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepository.create({ userId, items: [] });
      cart = await this.cartRepository.save(cart);
    }

    return cart;
  }

  async getCart(userId: string): Promise<any> {
    return this.cacheService.getOrSet(
      this.cartCacheKey(userId),
      async () => {
        const cart = await this.getOrCreateCart(userId);

        const enrichedItems = await Promise.all(
          cart.items.map(async (item) => {
            const product = await this.getProductFromCatalog(item.productId);
            return {
              id: item.id,
              productId: item.productId,
              quantity: item.quantity,
              billingPeriod: item.billingPeriod,
              product: product
                ? {
                    nameFr: product.nameFr,
                    nameEn: product.nameEn,
                    slug: product.slug,
                    productType: product.productType,
                    priceMonthly: product.priceMonthly,
                    priceYearly: product.priceYearly,
                    priceUnit: product.priceUnit,
                    isAvailable: product.isAvailable,
                    stockQuantity: product.stockQuantity,
                    images: product.images,
                  }
                : null,
            };
          }),
        );

        return {
          id: cart.id,
          userId: cart.userId,
          items: enrichedItems,
          itemCount: enrichedItems.length,
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt,
        };
      },
      CACHE_TTL.SHORT,
    );
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<any> {
    const product = await this.getProductFromCatalog(dto.productId);
    if (!product) {
      throw new RpcException({
        statusCode: 400,
        message: 'Product not found or unavailable',
        code: 'PRODUCT_UNAVAILABLE',
      });
    }

    if (!product.isAvailable) {
      throw new RpcException({
        statusCode: 400,
        message: 'Product is not available',
        code: 'PRODUCT_UNAVAILABLE',
      });
    }

    const billingPeriod = dto.billingPeriod || BillingPeriod.ONE_TIME;
    const cart = await this.getOrCreateCart(userId);

    let existingItem = await this.cartItemRepository.findOne({
      where: {
        cartId: cart.id,
        productId: dto.productId,
        billingPeriod,
      },
    });

    let quantity = dto.quantity;

    if (existingItem) {
      quantity = existingItem.quantity + dto.quantity;
    }

    // Clamp stock for physical products
    if (product.productType === 'physical' && product.stockQuantity != null) {
      quantity = Math.min(quantity, product.stockQuantity);
      if (quantity < 1) {
        throw new RpcException({
          statusCode: 400,
          message: `Insufficient stock. Available: ${product.stockQuantity}`,
          code: 'INSUFFICIENT_STOCK',
        });
      }
    }

    if (existingItem) {
      existingItem.quantity = quantity;
      await this.cartItemRepository.save(existingItem);
    } else {
      existingItem = this.cartItemRepository.create({
        cartId: cart.id,
        productId: dto.productId,
        quantity,
        billingPeriod,
      });
      await this.cartItemRepository.save(existingItem);
    }

    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
    billingPeriod?: BillingPeriod,
  ): Promise<any> {
    const cart = await this.getOrCreateCart(userId);

    const whereCondition: any = {
      cartId: cart.id,
      productId,
    };
    if (billingPeriod) {
      whereCondition.billingPeriod = billingPeriod;
    }

    const item = await this.cartItemRepository.findOne({ where: whereCondition });

    if (!item) {
      throw new RpcException({
        statusCode: 404,
        message: 'Cart item not found',
        code: 'CART_ITEM_NOT_FOUND',
      });
    }

    let quantity = dto.quantity;

    // Clamp stock for physical products
    const product = await this.getProductFromCatalog(productId);
    if (product?.productType === 'physical' && product.stockQuantity != null) {
      quantity = Math.min(quantity, product.stockQuantity);
    }

    item.quantity = quantity;
    await this.cartItemRepository.save(item);

    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string, billingPeriod?: BillingPeriod): Promise<any> {
    const cart = await this.getOrCreateCart(userId);

    const whereCondition: any = {
      cartId: cart.id,
      productId,
    };
    if (billingPeriod) {
      whereCondition.billingPeriod = billingPeriod;
    }

    const result = await this.cartItemRepository.delete(whereCondition);

    if (result.affected === 0) {
      throw new RpcException({
        statusCode: 404,
        message: 'Cart item not found',
        code: 'CART_ITEM_NOT_FOUND',
      });
    }

    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }

  async clearCart(userId: string): Promise<{ success: boolean }> {
    const cart = await this.cartRepository.findOne({ where: { userId } });

    if (cart) {
      await this.cartItemRepository.delete({ cartId: cart.id });
    }

    await this.invalidateCartCache(userId);
    return { success: true };
  }

  async mergeCart(userId: string, dto: MergeCartDto): Promise<any> {
    const cart = await this.getOrCreateCart(userId);

    for (const anonymousItem of dto.items) {
      const billingPeriod = anonymousItem.billingPeriod || BillingPeriod.ONE_TIME;

      const existingItem = await this.cartItemRepository.findOne({
        where: {
          cartId: cart.id,
          productId: anonymousItem.productId,
          billingPeriod,
        },
      });

      let quantity = anonymousItem.quantity;

      if (existingItem) {
        // Take the max of both quantities
        quantity = Math.max(existingItem.quantity, anonymousItem.quantity);
      }

      // Clamp stock for physical products
      const product = await this.getProductFromCatalog(anonymousItem.productId);
      if (product?.productType === 'physical' && product.stockQuantity != null) {
        quantity = Math.min(quantity, product.stockQuantity);
      }

      // Skip if product not found
      if (!product) {
        this.logger.warn(`Skipping merge for unavailable product ${anonymousItem.productId}`);
        continue;
      }

      if (existingItem) {
        existingItem.quantity = quantity;
        await this.cartItemRepository.save(existingItem);
      } else {
        const newItem = this.cartItemRepository.create({
          cartId: cart.id,
          productId: anonymousItem.productId,
          quantity,
          billingPeriod,
        });
        await this.cartItemRepository.save(newItem);
      }
    }

    await this.invalidateCartCache(userId);
    return this.getCart(userId);
  }
}
