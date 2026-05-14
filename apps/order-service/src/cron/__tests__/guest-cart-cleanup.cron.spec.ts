import { Test, TestingModule } from '@nestjs/testing';
import { CynaLoggerService } from '@cyna-api/common';
import { GuestCartCleanupCron } from '../guest-cart-cleanup.cron';
import { CartService } from '../../services/cart.service';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockCartService = {
  cleanupExpiredGuestCarts: jest.fn(),
};

describe('GuestCartCleanupCron', () => {
  let cron: GuestCartCleanupCron;
  let cartService: jest.Mocked<Pick<CartService, 'cleanupExpiredGuestCarts'>>;
  let logger: jest.Mocked<CynaLoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestCartCleanupCron,
        { provide: CartService, useValue: mockCartService },
        { provide: CynaLoggerService, useValue: mockLogger },
      ],
    }).compile();

    cron = module.get<GuestCartCleanupCron>(GuestCartCleanupCron);
    cartService = module.get(CartService);
    logger = module.get(CynaLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupExpiredGuestCarts()', () => {
    it('should call cartService.cleanupExpiredGuestCarts', async () => {
      mockCartService.cleanupExpiredGuestCarts.mockResolvedValue(0);

      await cron.cleanupExpiredGuestCarts();

      expect(cartService.cleanupExpiredGuestCarts).toHaveBeenCalledTimes(1);
    });

    it('should log the deleted count when greater than zero', async () => {
      mockCartService.cleanupExpiredGuestCarts.mockResolvedValue(7);

      await cron.cleanupExpiredGuestCarts();

      expect(logger.log).toHaveBeenCalledWith(
        'Cleaned up 7 expired guest carts',
        'GuestCartCleanupCron',
      );
    });

    it('should not log when no carts were deleted', async () => {
      mockCartService.cleanupExpiredGuestCarts.mockResolvedValue(0);

      await cron.cleanupExpiredGuestCarts();

      expect(logger.log).not.toHaveBeenCalled();
    });

    it('should catch and log Error exceptions without re-throwing', async () => {
      const error = new Error('Database connection failed');
      mockCartService.cleanupExpiredGuestCarts.mockRejectedValue(error);

      await expect(cron.cleanupExpiredGuestCarts()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup expired guest carts: Database connection failed',
        error.stack,
        'GuestCartCleanupCron',
      );
      expect(logger.log).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockCartService.cleanupExpiredGuestCarts.mockRejectedValue('Unknown error');

      await expect(cron.cleanupExpiredGuestCarts()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup expired guest carts: Unknown error',
        undefined,
        'GuestCartCleanupCron',
      );
      expect(logger.log).not.toHaveBeenCalled();
    });
  });
});
