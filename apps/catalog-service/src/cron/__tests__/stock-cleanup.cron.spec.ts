import { Test, TestingModule } from '@nestjs/testing';
import { StockCleanupCron } from '../stock-cleanup.cron';
import { StockService } from '../../services/stock.service';
import { CynaLoggerService } from '@cyna-api/common';

// Logger mock
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// StockService mock
const mockStockService = {
  cleanupExpiredReservations: jest.fn(),
};

// StockCleanupCron tests
describe('StockCleanupCron', () => {
  let cron: StockCleanupCron;
  let stockService: jest.Mocked<StockService>;
  let logger: jest.Mocked<CynaLoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockCleanupCron,
        {
          provide: StockService,
          useValue: mockStockService,
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    cron = module.get<StockCleanupCron>(StockCleanupCron);
    stockService = module.get(StockService);
    logger = module.get(CynaLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Cron handler tests
  describe('cleanupExpiredReservations()', () => {
    // Verifies the cron calls cleanupExpiredReservations on the service
    it('should call stockService.cleanupExpiredReservations', async () => {
      mockStockService.cleanupExpiredReservations.mockResolvedValue(0);

      await cron.cleanupExpiredReservations();

      expect(stockService.cleanupExpiredReservations).toHaveBeenCalledTimes(1);
    });

    // Verifies the count of cleaned-up reservations is logged when > 0
    it('should log the number of cleaned up reservations if count > 0', async () => {
      mockStockService.cleanupExpiredReservations.mockResolvedValue(5);

      await cron.cleanupExpiredReservations();

      expect(logger.log).toHaveBeenCalledWith(
        'Cleaned up 5 expired stock reservations',
        'StockCleanupCron',
      );
    });

    // Verifies no log is emitted when no reservations are cleaned up
    it('should not log if no reservations cleaned up', async () => {
      mockStockService.cleanupExpiredReservations.mockResolvedValue(0);

      await cron.cleanupExpiredReservations();

      expect(logger.log).not.toHaveBeenCalled();
    });

    // Verifies errors are caught and logged
    it('should catch and log errors', async () => {
      const error = new Error('Database connection failed');
      mockStockService.cleanupExpiredReservations.mockRejectedValue(error);

      await cron.cleanupExpiredReservations();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup expired reservations: Database connection failed',
        error.stack,
        'StockCleanupCron',
      );
    });

    // Verifies non-Error exceptions are handled correctly
    it('should handle non-Error exceptions', async () => {
      mockStockService.cleanupExpiredReservations.mockRejectedValue('Unknown error');

      await cron.cleanupExpiredReservations();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup expired reservations: Unknown error',
        undefined,
        'StockCleanupCron',
      );
    });
  });
});
