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
import { AddCartItemDto, UpdateCartItemDto } from '../dto';

export type CartOwner = { userId?: string; sessionId?: string };

@Injectable()
export class CartService {
  private readonly CATALOG_TIMEOUT = 5000;
  private readonly GUEST_CART_TTL_DAYS = 7;

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

  private cartCacheKey(owner: CartOwner): string {
    if (owner.userId) {
      return `${CACHE_PREFIXES.CART}user:${owner.userId}`;
    }
    return `${CACHE_PREFIXES.CART}session:${owner.sessionId}`;
  }

  private async invalidateCartCache(owner: CartOwner): Promise<void> {
    await this.cacheService.del(this.cartCacheKey(owner));
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

  async findCart(owner: CartOwner): Promise<Cart | null> {
    if (owner.userId) {
      return this.cartRepository.findOne({
        where: { userId: owner.userId },
        relations: ['items'],
      });
    }
    if (owner.sessionId) {
      return this.cartRepository.findOne({
        where: { sessionId: owner.sessionId },
        relations: ['items'],
      });
    }
    return null;
  }

  async findCartById(cartId: string): Promise<Cart | null> {
    return this.cartRepository.findOne({
      where: { id: cartId },
      relations: ['items'],
    });
  }

  async getOrCreateCart(owner: CartOwner): Promise<Cart> {
    const cart = await this.findCart(owner);
    if (cart) return cart;

    const expiresAt = owner.userId
      ? null
      : new Date(Date.now() + this.GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000);

    const newCart = this.cartRepository.create({
      userId: owner.userId ?? null,
      sessionId: owner.sessionId ?? null,
      expiresAt,
      items: [],
    });
    return this.cartRepository.save(newCart);
  }

  private emptyCartResponse(owner: CartOwner) {
    return {
      id: null,
      userId: owner.userId ?? null,
      sessionId: owner.sessionId ?? null,
      items: [],
      itemCount: 0,
      createdAt: null,
      updatedAt: null,
    };
  }

  async getCart(owner: CartOwner): Promise<any> {
    return this.cacheService.getOrSet(
      this.cartCacheKey(owner),
      async () => {
        const cart = await this.findCart(owner);
        if (!cart) return this.emptyCartResponse(owner);

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
          sessionId: cart.sessionId,
          items: enrichedItems,
          itemCount: enrichedItems.length,
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt,
        };
      },
      CACHE_TTL.SHORT,
    );
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto): Promise<any> {
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
    const cart = await this.getOrCreateCart(owner);

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

    await this.invalidateCartCache(owner);
    return this.getCart(owner);
  }

  async updateItem(
    owner: CartOwner,
    productId: string,
    dto: UpdateCartItemDto,
    billingPeriod?: BillingPeriod,
  ): Promise<any> {
    const cart = await this.findCart(owner);
    if (!cart) {
      throw new RpcException({
        statusCode: 404,
        message: 'Cart not found',
        code: 'CART_NOT_FOUND',
      });
    }

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

    await this.invalidateCartCache(owner);
    return this.getCart(owner);
  }

  async removeItem(
    owner: CartOwner,
    productId: string,
    billingPeriod?: BillingPeriod,
  ): Promise<any> {
    const cart = await this.findCart(owner);
    if (!cart) {
      throw new RpcException({
        statusCode: 404,
        message: 'Cart not found',
        code: 'CART_NOT_FOUND',
      });
    }

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

    await this.invalidateCartCache(owner);
    return this.getCart(owner);
  }

  async clearCart(owner: CartOwner): Promise<{ success: boolean }> {
    let cart: Cart | null = null;

    if (owner.userId) {
      cart = await this.cartRepository.findOne({ where: { userId: owner.userId } });
    } else if (owner.sessionId) {
      cart = await this.cartRepository.findOne({ where: { sessionId: owner.sessionId } });
    }

    if (cart) {
      await this.cartItemRepository.delete({ cartId: cart.id });
    }

    await this.invalidateCartCache(owner);
    return { success: true };
  }

  async mergeGuestCart(userId: string, sessionId: string): Promise<any> {
    const guestCart = await this.cartRepository.findOne({
      where: { sessionId },
      relations: ['items'],
    });

    if (!guestCart || guestCart.items.length === 0) {
      // No guest cart to merge, return current user cart (without creating one)
      return this.getCart({ userId });
    }

    // Guest cart has items to merge — now we need the user cart (create if needed)

    const userCart = await this.getOrCreateCart({ userId });

    for (const guestItem of guestCart.items) {
      const existingItem = await this.cartItemRepository.findOne({
        where: {
          cartId: userCart.id,
          productId: guestItem.productId,
          billingPeriod: guestItem.billingPeriod,
        },
      });

      let quantity = guestItem.quantity;

      if (existingItem) {
        quantity = Math.max(existingItem.quantity, guestItem.quantity);
      }

      // Clamp stock for physical products
      const product = await this.getProductFromCatalog(guestItem.productId);
      if (!product) {
        this.logger.warn(`Skipping merge for unavailable product ${guestItem.productId}`);
        continue;
      }
      if (product.productType === 'physical' && product.stockQuantity != null) {
        quantity = Math.min(quantity, product.stockQuantity);
      }

      if (existingItem) {
        existingItem.quantity = quantity;
        await this.cartItemRepository.save(existingItem);
      } else {
        const newItem = this.cartItemRepository.create({
          cartId: userCart.id,
          productId: guestItem.productId,
          quantity,
          billingPeriod: guestItem.billingPeriod,
        });
        await this.cartItemRepository.save(newItem);
      }
    }

    // Delete guest cart entirely
    await this.cartItemRepository.delete({ cartId: guestCart.id });
    await this.cartRepository.remove(guestCart);

    // Invalidate both caches
    await this.invalidateCartCache({ userId });
    await this.invalidateCartCache({ sessionId });

    return this.getCart({ userId });
  }
}
