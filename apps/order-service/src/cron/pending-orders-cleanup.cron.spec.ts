import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatus } from '@cyna-api/common';
import { Order } from '../entities/order.entity';
import { PendingOrdersCleanupCron } from './pending-orders-cleanup.cron';

describe('PendingOrdersCleanupCron', () => {
  let cron: PendingOrdersCleanupCron;
  let orderRepository: Partial<Repository<Order>>;
  let qbExecute: jest.Mock;
  let qbWhere: jest.Mock;
  let qbAndWhere: jest.Mock;
  let qbSet: jest.Mock;
  let qbUpdate: jest.Mock;

  beforeEach(async () => {
    qbExecute = jest.fn().mockResolvedValue({ affected: 0 });
    qbAndWhere = jest.fn().mockReturnThis();
    qbWhere = jest.fn().mockReturnThis();
    qbSet = jest.fn().mockReturnThis();
    qbUpdate = jest.fn().mockReturnThis();

    const queryBuilder = {
      update: qbUpdate,
      set: qbSet,
      where: qbWhere,
      andWhere: qbAndWhere,
      execute: qbExecute,
    };
    qbUpdate.mockReturnValue(queryBuilder);
    qbSet.mockReturnValue(queryBuilder);
    qbWhere.mockReturnValue(queryBuilder);
    qbAndWhere.mockReturnValue(queryBuilder);

    orderRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingOrdersCleanupCron,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
      ],
    }).compile();

    cron = module.get<PendingOrdersCleanupCron>(PendingOrdersCleanupCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  it('should issue a set-based UPDATE constrained to stale PENDING rows', async () => {
    await cron.handle();

    expect(qbUpdate).toHaveBeenCalledWith(Order);
    // CANCELLED keeps the audit trail intact (vs deletion) and mirrors the
    // failure-mode status the Stripe webhook would set on a failed charge.
    expect(qbSet).toHaveBeenCalledWith({ status: OrderStatus.CANCELLED });
    expect(qbWhere).toHaveBeenCalledWith('status = :pending', { pending: OrderStatus.PENDING });
    // The `updated_at` cutoff is now-dependent — assert it's a Date, not a
    // specific timestamp.
    const andWhereCall = qbAndWhere.mock.calls[0];
    expect(andWhereCall[0]).toBe('updated_at < :threshold');
    expect(andWhereCall[1].threshold).toBeInstanceOf(Date);
    expect(qbExecute).toHaveBeenCalledTimes(1);
  });

  it('should be a no-op when nothing matches (idempotent re-run)', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 0 });

    await cron.handle();

    // The WHERE clause filters on PENDING, so re-running the cron on an
    // already-cleaned table cannot accidentally flip CANCELLED → CANCELLED
    // (or worse, overwrite something else). This is the property that makes
    // the set-based UPDATE safe against the find-then-save race that the
    // previous version had against concurrent Stripe webhooks.
    expect(qbExecute).toHaveBeenCalledTimes(1);
  });

  it('should log when rows are cancelled', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 3 });
    const logSpy = jest.spyOn((cron as unknown as { logger: { log: jest.Mock } }).logger, 'log');

    await cron.handle();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cancelled 3'));
  });

  it('should stay silent when zero rows match', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 0 });
    const logSpy = jest.spyOn((cron as unknown as { logger: { log: jest.Mock } }).logger, 'log');

    await cron.handle();

    expect(logSpy).not.toHaveBeenCalled();
  });
});
