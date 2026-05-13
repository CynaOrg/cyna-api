import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { CartService } from './cart.service';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { BillingPeriod, ProductType } from '@cyna-api/common';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: Partial<Repository<Cart>>;
  let cartItemRepository: Partial<Repository<CartItem>>;
  let catalogClient: { send: jest.Mock; emit: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };
  let cacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
  };

  const baseProduct = {
    id: 'prod-1',
    nameFr: 'Produit 1',
    nameEn: 'Product 1',
    slug: 'product-1',
    productType: ProductType.LICENSE,
    priceMonthly: 19.99,
    priceYearly: 199.99,
    priceUnit: 49.99,
    isAvailable: true,
    stockQuantity: null,
    images: [{ imageUrl: 'http://img/1.png' }],
  };

  const physicalProduct = {
    ...baseProduct,
    id: 'prod-physical',
    productType: ProductType.PHYSICAL,
    stockQuantity: 5,
  };

  beforeEach(async () => {
    cartRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'cart-new', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    cartItemRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'item-new', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    catalogClient = {
      send: jest.fn().mockReturnValue(of(baseProduct)),
      emit: jest.fn(),
    };

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      // Default: bypass cache — call the factory directly
      getOrSet: jest.fn(async (_key, factory) => factory()),
    };

    // CynaLoggerService and CynaCacheService have provider tokens we don't
    // want to mock by string match; construct manually instead.
    service = new CartService(
      cartRepository as Repository<Cart>,
      cartItemRepository as Repository<CartItem>,
      catalogClient as never,
      logger as never,
      cacheService as never,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('findCart', () => {
    it('returns user cart with items when userId is provided', async () => {
      const userCart = { id: 'c1', userId: 'u1', items: [] };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(userCart);

      const result = await service.findCart({ userId: 'u1' });

      expect(result).toEqual(userCart);
      expect(cartRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        relations: ['items'],
      });
    });

    it('returns guest cart with items when only sessionId is provided', async () => {
      const guestCart = { id: 'c2', sessionId: 's1', items: [] };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(guestCart);

      const result = await service.findCart({ sessionId: 's1' });

      expect(result).toEqual(guestCart);
      expect(cartRepository.findOne).toHaveBeenCalledWith({
        where: { sessionId: 's1' },
        relations: ['items'],
      });
    });

    it('returns null when neither userId nor sessionId is provided', async () => {
      const result = await service.findCart({});
      expect(result).toBeNull();
      expect(cartRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findCartById', () => {
    it('looks up by primary key with items relation', async () => {
      const cart = { id: 'c1', items: [] };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(cart);

      const result = await service.findCartById('c1');

      expect(result).toEqual(cart);
      expect(cartRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'c1' },
        relations: ['items'],
      });
    });
  });

  describe('getOrCreateCart', () => {
    it('returns existing cart when one is found for the user', async () => {
      const existing = { id: 'c1', userId: 'u1', items: [] };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(existing);

      const result = await service.getOrCreateCart({ userId: 'u1' });

      expect(result).toBe(existing);
      expect(cartRepository.create).not.toHaveBeenCalled();
    });

    it('creates a fresh user cart with no expiresAt when none exists', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.getOrCreateCart({ userId: 'u1' });

      expect(cartRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          sessionId: null,
          expiresAt: null,
          items: [],
        }),
      );
    });

    it('creates a guest cart with a 7-day expiry when only sessionId is provided', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      const before = Date.now();

      await service.getOrCreateCart({ sessionId: 'sess-1' });

      const createCall = (cartRepository.create as jest.Mock).mock.calls[0][0];
      expect(createCall.userId).toBeNull();
      expect(createCall.sessionId).toBe('sess-1');
      expect(createCall.expiresAt).toBeInstanceOf(Date);
      const delta = (createCall.expiresAt as Date).getTime() - before;
      // ~7 days in ms, give 5 minutes of slack to account for slow CI.
      expect(delta).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000);
      expect(delta).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
    });
  });

  describe('getCart', () => {
    it('returns the empty cart response shape when no cart exists', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getCart({ userId: 'u1' });

      expect(result).toEqual({
        id: null,
        userId: 'u1',
        sessionId: null,
        items: [],
        itemCount: 0,
        createdAt: null,
        updatedAt: null,
      });
      expect(catalogClient.send).not.toHaveBeenCalled();
    });

    it('enriches each cart item with catalog product data', async () => {
      const cart = {
        id: 'c1',
        userId: 'u1',
        sessionId: null,
        items: [
          {
            id: 'i1',
            productId: 'prod-1',
            quantity: 2,
            billingPeriod: BillingPeriod.ONE_TIME,
          },
        ],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(cart);
      catalogClient.send.mockReturnValueOnce(of(baseProduct));

      const result = await service.getCart({ userId: 'u1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].product).toEqual(
        expect.objectContaining({
          nameFr: 'Produit 1',
          slug: 'product-1',
          priceUnit: 49.99,
        }),
      );
      expect(result.itemCount).toBe(1);
      expect(result.id).toBe('c1');
    });

    it('returns item with product=null when catalog service fails (graceful degradation)', async () => {
      const cart = {
        id: 'c1',
        userId: 'u1',
        sessionId: null,
        items: [
          {
            id: 'i1',
            productId: 'prod-down',
            quantity: 1,
            billingPeriod: BillingPeriod.ONE_TIME,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(cart);
      // Catalog call errors out — service should swallow and yield product:null
      catalogClient.send.mockReturnValueOnce(throwError(() => new Error('catalog unreachable')));

      const result = await service.getCart({ userId: 'u1' });

      expect(result.items[0].product).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch product prod-down'),
      );
    });
  });

  describe('addItem', () => {
    it('throws PRODUCT_UNAVAILABLE when catalog returns null', async () => {
      catalogClient.send.mockReturnValueOnce(of(null));

      await expect(
        service.addItem(
          { userId: 'u1' },
          { productId: 'prod-1', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME },
        ),
      ).rejects.toThrow(RpcException);
    });

    it('throws PRODUCT_UNAVAILABLE when product is flagged unavailable', async () => {
      catalogClient.send.mockReturnValueOnce(of({ ...baseProduct, isAvailable: false }));

      await expect(
        service.addItem(
          { userId: 'u1' },
          { productId: 'prod-1', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME },
        ),
      ).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'PRODUCT_UNAVAILABLE' }),
      });
    });

    it('creates a new cart item when none exists for that product+billingPeriod', async () => {
      catalogClient.send.mockReturnValue(of(baseProduct));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null); // getOrCreateCart inner findOne
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      // getCart() call afterwards — return empty cart
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.addItem(
        { userId: 'u1' },
        { productId: 'prod-1', quantity: 3, billingPeriod: BillingPeriod.MONTHLY },
      );

      expect(cartItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 3,
          billingPeriod: BillingPeriod.MONTHLY,
        }),
      );
      expect(cartItemRepository.save).toHaveBeenCalled();
      expect(cacheService.del).toHaveBeenCalled();
    });

    it('increments quantity on an existing item rather than duplicating', async () => {
      catalogClient.send.mockReturnValue(of(baseProduct));
      const existingCart = { id: 'cart-1', userId: 'u1', items: [] };
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(existingCart);
      const existingItem = {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'prod-1',
        quantity: 2,
        billingPeriod: BillingPeriod.ONE_TIME,
      };
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(existingItem);
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.addItem(
        { userId: 'u1' },
        { productId: 'prod-1', quantity: 3, billingPeriod: BillingPeriod.ONE_TIME },
      );

      // 2 (existing) + 3 (requested) = 5
      expect(cartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1', quantity: 5 }),
      );
      expect(cartItemRepository.create).not.toHaveBeenCalled();
    });

    it('clamps requested quantity to stockQuantity for physical products', async () => {
      catalogClient.send.mockReturnValue(of(physicalProduct));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      // Request 99, stock is 5 — must clamp to 5
      await service.addItem(
        { userId: 'u1' },
        {
          productId: 'prod-physical',
          quantity: 99,
          billingPeriod: BillingPeriod.ONE_TIME,
        },
      );

      expect(cartItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }),
      );
    });

    it('throws INSUFFICIENT_STOCK when physical stock is 0', async () => {
      catalogClient.send.mockReturnValue(of({ ...physicalProduct, stockQuantity: 0 }));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.addItem(
          { userId: 'u1' },
          {
            productId: 'prod-physical',
            quantity: 1,
            billingPeriod: BillingPeriod.ONE_TIME,
          },
        ),
      ).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
      });
    });

    it('defaults billingPeriod to ONE_TIME when caller omits it', async () => {
      catalogClient.send.mockReturnValue(of(baseProduct));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.addItem({ userId: 'u1' }, { productId: 'prod-1', quantity: 1 } as never);

      expect(cartItemRepository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ billingPeriod: BillingPeriod.ONE_TIME }),
      });
    });
  });

  describe('updateItem', () => {
    it('throws CART_NOT_FOUND when the owner has no cart', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateItem({ userId: 'u1' }, 'prod-1', { quantity: 2 }),
      ).rejects.toMatchObject({ error: expect.objectContaining({ code: 'CART_NOT_FOUND' }) });
    });

    it('throws CART_ITEM_NOT_FOUND when the item is missing', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateItem({ userId: 'u1' }, 'prod-x', { quantity: 5 }),
      ).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'CART_ITEM_NOT_FOUND' }),
      });
    });

    it('updates an existing item to the requested quantity', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      const item = { id: 'item-1', quantity: 1 };
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(item);
      catalogClient.send.mockReturnValue(of(baseProduct));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.updateItem({ userId: 'u1' }, 'prod-1', { quantity: 4 });

      expect(cartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1', quantity: 4 }),
      );
    });

    it('clamps quantity to stockQuantity for physical products', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      const item = { id: 'item-1', quantity: 1 };
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(item);
      catalogClient.send.mockReturnValue(of(physicalProduct)); // stock 5
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.updateItem({ userId: 'u1' }, 'prod-physical', { quantity: 50 });

      expect(cartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1', quantity: 5 }),
      );
    });

    it('passes billingPeriod into the where clause when provided', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'i', quantity: 1 });
      catalogClient.send.mockReturnValue(of(baseProduct));
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.updateItem({ userId: 'u1' }, 'prod-1', { quantity: 2 }, BillingPeriod.YEARLY);

      expect(cartItemRepository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ billingPeriod: BillingPeriod.YEARLY }),
      });
    });
  });

  describe('removeItem', () => {
    it('throws CART_NOT_FOUND when no cart exists for the owner', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.removeItem({ userId: 'u1' }, 'prod-1')).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'CART_NOT_FOUND' }),
      });
    });

    it('throws CART_ITEM_NOT_FOUND when delete affects 0 rows', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      (cartItemRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 0 });

      await expect(service.removeItem({ userId: 'u1' }, 'prod-1')).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'CART_ITEM_NOT_FOUND' }),
      });
    });

    it('deletes by (cartId, productId) when no billingPeriod is provided', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      (cartItemRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 1 });
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.removeItem({ userId: 'u1' }, 'prod-1');

      expect(cartItemRepository.delete).toHaveBeenCalledWith({
        cartId: 'cart-1',
        productId: 'prod-1',
      });
    });

    it('narrows delete by billingPeriod when provided', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });
      (cartItemRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 1 });
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.removeItem({ userId: 'u1' }, 'prod-1', BillingPeriod.MONTHLY);

      expect(cartItemRepository.delete).toHaveBeenCalledWith({
        cartId: 'cart-1',
        productId: 'prod-1',
        billingPeriod: BillingPeriod.MONTHLY,
      });
    });
  });

  describe('clearCart', () => {
    it('deletes items for an existing user cart', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-1' });

      const result = await service.clearCart({ userId: 'u1' });

      expect(cartItemRepository.delete).toHaveBeenCalledWith({ cartId: 'cart-1' });
      expect(result).toEqual({ success: true });
    });

    it('deletes items for an existing session-based cart', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({ id: 'cart-2' });

      await service.clearCart({ sessionId: 's1' });

      expect(cartItemRepository.delete).toHaveBeenCalledWith({ cartId: 'cart-2' });
    });

    it('still returns success when no cart exists (idempotent)', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.clearCart({ userId: 'u1' });

      expect(cartItemRepository.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(cacheService.del).toHaveBeenCalled();
    });

    it('no-ops when owner has neither userId nor sessionId', async () => {
      const result = await service.clearCart({});
      expect(result).toEqual({ success: true });
      expect(cartRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('mergeGuestCart', () => {
    it('does not create a user cart when guest cart does not exist', async () => {
      // Guest lookup returns null
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      // Subsequent getCart() call from inside mergeGuestCart
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.mergeGuestCart('u1', 's1');

      expect(cartRepository.create).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ items: [], itemCount: 0, userId: 'u1' }));
    });

    it('returns user cart unchanged when guest cart has no items', async () => {
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [],
      });
      (cartRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await service.mergeGuestCart('u1', 's1');

      expect(cartRepository.remove).not.toHaveBeenCalled();
    });

    it('takes the MAX of quantities when same product is already in user cart', async () => {
      const guestCart = {
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [{ productId: 'prod-1', quantity: 5, billingPeriod: BillingPeriod.ONE_TIME }],
      };
      const userCart = { id: 'user-1', userId: 'u1', items: [] };

      (cartRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(guestCart) // initial guest lookup
        .mockResolvedValueOnce(userCart) // getOrCreateCart user lookup
        .mockResolvedValueOnce(null); // final getCart

      const existingUserItem = {
        id: 'ui-1',
        cartId: 'user-1',
        productId: 'prod-1',
        quantity: 2,
        billingPeriod: BillingPeriod.ONE_TIME,
      };
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(existingUserItem);
      catalogClient.send.mockReturnValueOnce(of(baseProduct));

      await service.mergeGuestCart('u1', 's1');

      // max(2, 5) = 5
      expect(cartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ui-1', quantity: 5 }),
      );
      // Guest cart cleaned up
      expect(cartItemRepository.delete).toHaveBeenCalledWith({ cartId: 'guest-1' });
      expect(cartRepository.remove).toHaveBeenCalledWith(guestCart);
    });

    it('creates new item in user cart when guest has a product user does not', async () => {
      const guestCart = {
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [{ productId: 'prod-1', quantity: 3, billingPeriod: BillingPeriod.MONTHLY }],
      };
      const userCart = { id: 'user-1', userId: 'u1', items: [] };

      (cartRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(guestCart)
        .mockResolvedValueOnce(userCart)
        .mockResolvedValueOnce(null);

      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      catalogClient.send.mockReturnValueOnce(of(baseProduct));

      await service.mergeGuestCart('u1', 's1');

      expect(cartItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cartId: 'user-1',
          productId: 'prod-1',
          quantity: 3,
          billingPeriod: BillingPeriod.MONTHLY,
        }),
      );
    });

    it('clamps merged quantity by stock for physical products', async () => {
      const guestCart = {
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [
          { productId: 'prod-physical', quantity: 100, billingPeriod: BillingPeriod.ONE_TIME },
        ],
      };
      const userCart = { id: 'user-1', userId: 'u1', items: [] };

      (cartRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(guestCart)
        .mockResolvedValueOnce(userCart)
        .mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      catalogClient.send.mockReturnValueOnce(of(physicalProduct)); // stock 5

      await service.mergeGuestCart('u1', 's1');

      expect(cartItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }),
      );
    });

    it('skips merge for products that have been removed from the catalog', async () => {
      const guestCart = {
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [{ productId: 'prod-gone', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME }],
      };
      const userCart = { id: 'user-1', userId: 'u1', items: [] };

      (cartRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(guestCart)
        .mockResolvedValueOnce(userCart)
        .mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      catalogClient.send.mockReturnValueOnce(of(null));

      await service.mergeGuestCart('u1', 's1');

      expect(cartItemRepository.create).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping merge for unavailable product prod-gone'),
      );
    });

    it('invalidates both user and guest cache entries after merging', async () => {
      const guestCart = {
        id: 'guest-1',
        userId: null,
        sessionId: 's1',
        items: [{ productId: 'prod-1', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME }],
      };
      const userCart = { id: 'user-1', userId: 'u1', items: [] };

      (cartRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(guestCart)
        .mockResolvedValueOnce(userCart)
        .mockResolvedValueOnce(null);
      (cartItemRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      catalogClient.send.mockReturnValueOnce(of(baseProduct));

      await service.mergeGuestCart('u1', 's1');

      // Two distinct cache keys should be invalidated (user + session)
      const delKeys = (cacheService.del as jest.Mock).mock.calls.map((c) => c[0]);
      expect(delKeys.some((k) => k.includes('user:u1'))).toBe(true);
      expect(delKeys.some((k) => k.includes('session:s1'))).toBe(true);
    });
  });
});
