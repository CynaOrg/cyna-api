import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, EVENT_PATTERNS, Language } from '@cyna-api/common';
import { Cart } from '../entities/cart.entity';
import { CartAbandonedCron } from './cart-abandoned.cron';

describe('CartAbandonedCron', () => {
  let cron: CartAbandonedCron;
  let cartRepository: Partial<Repository<Cart>>;
  let notificationClient: { emit: jest.Mock };
  let userClient: { send: jest.Mock; emit: jest.Mock };

  const baseCart = (overrides: Partial<Cart> = {}): Cart =>
    ({
      id: 'cart-1',
      userId: 'user-1',
      sessionId: null,
      abandonedNotifiedAt: null,
      updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          quantity: 2,
          productSnapshot: { nameFr: 'Produit', nameEn: 'Product' },
        },
      ] as unknown as Cart['items'],
      ...overrides,
    }) as Cart;

  beforeEach(async () => {
    cartRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };

    notificationClient = { emit: jest.fn() };
    userClient = {
      send: jest
        .fn()
        .mockReturnValue(of({ email: 'user@test.com', preferredLanguage: Language.FR })),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartAbandonedCron,
        { provide: getRepositoryToken(Cart), useValue: cartRepository },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
        { provide: SERVICE_NAMES.USER, useValue: userClient },
      ],
    }).compile();

    cron = module.get<CartAbandonedCron>(CartAbandonedCron);
  });

  afterEach(() => jest.clearAllMocks());

  it('is a no-op when nothing matches', async () => {
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([]);

    await cron.handle();

    expect(userClient.send).not.toHaveBeenCalled();
    expect(notificationClient.emit).not.toHaveBeenCalled();
  });

  it('skips carts that are user-less (guest sessions have no email)', async () => {
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([
      baseCart({ userId: null, sessionId: 'sess-1' }),
    ]);

    await cron.handle();

    expect(userClient.send).not.toHaveBeenCalled();
    expect(notificationClient.emit).not.toHaveBeenCalled();
  });

  it('skips carts with no items', async () => {
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([baseCart({ items: [] as never })]);

    await cron.handle();

    expect(notificationClient.emit).not.toHaveBeenCalled();
  });

  it('emits CHECKOUT_EXPIRED and stamps abandonedNotifiedAt on eligible carts', async () => {
    const cart = baseCart();
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([cart]);

    await cron.handle();

    expect(notificationClient.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED,
      expect.objectContaining({
        cartId: 'cart-1',
        userId: 'user-1',
        email: 'user@test.com',
        language: Language.FR,
        itemCount: 1,
        itemsSummary: 'Produit x2',
      }),
    );
    expect(cartRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ abandonedNotifiedAt: expect.any(Date) }),
    );
  });

  it('skips when user service responds with no email', async () => {
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([baseCart()]);
    userClient.send.mockReturnValueOnce(of({ email: null }));

    await cron.handle();

    expect(notificationClient.emit).not.toHaveBeenCalled();
    expect(cartRepository.save).not.toHaveBeenCalled();
  });

  it('skips when user service returns null user (unknown id)', async () => {
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([baseCart()]);
    userClient.send.mockReturnValueOnce(of(null));

    await cron.handle();

    expect(notificationClient.emit).not.toHaveBeenCalled();
  });

  it('logs and continues when user service throws (single cart failure does not abort sweep)', async () => {
    const goodCart = baseCart({ id: 'cart-good', userId: 'user-good' });
    const badCart = baseCart({ id: 'cart-bad', userId: 'user-bad' });
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([badCart, goodCart]);

    userClient.send
      .mockReturnValueOnce(throwError(() => new Error('user-svc-down')))
      .mockReturnValueOnce(of({ email: 'good@test.com', preferredLanguage: Language.EN }));

    await cron.handle();

    expect(notificationClient.emit).toHaveBeenCalledTimes(1);
    expect(notificationClient.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED,
      expect.objectContaining({
        cartId: 'cart-good',
        email: 'good@test.com',
        language: Language.EN,
      }),
    );
  });

  it('falls back to nameEn when nameFr is missing in productSnapshot', async () => {
    const cart = baseCart({
      items: [
        {
          id: 'i',
          productId: 'p',
          quantity: 1,
          productSnapshot: { nameEn: 'Only-EN' },
        },
      ] as unknown as Cart['items'],
    });
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([cart]);

    await cron.handle();

    expect(notificationClient.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED,
      expect.objectContaining({ itemsSummary: 'Only-EN x1' }),
    );
  });

  it("defaults item name to 'Item' when snapshot is missing entirely", async () => {
    const cart = baseCart({
      items: [{ id: 'i', productId: 'p', quantity: 3 }] as unknown as Cart['items'],
    });
    (cartRepository.find as jest.Mock).mockResolvedValueOnce([cart]);

    await cron.handle();

    expect(notificationClient.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED,
      expect.objectContaining({ itemsSummary: 'Item x3' }),
    );
  });
});
