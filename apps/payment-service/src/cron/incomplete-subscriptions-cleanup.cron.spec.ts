import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionStatus } from '@cyna-api/common';
import { Subscription } from '../entities/subscription.entity';
import { IncompleteSubscriptionsCleanupCron } from './incomplete-subscriptions-cleanup.cron';

describe('IncompleteSubscriptionsCleanupCron', () => {
  let cron: IncompleteSubscriptionsCleanupCron;
  let subscriptionRepository: Partial<Repository<Subscription>>;
  let qbExecute: jest.Mock;
  let qbWhere: jest.Mock;
  let qbAndWhere: jest.Mock;
  let qbFrom: jest.Mock;
  let qbDelete: jest.Mock;

  beforeEach(async () => {
    qbExecute = jest.fn().mockResolvedValue({ affected: 0 });
    qbAndWhere = jest.fn().mockReturnThis();
    qbWhere = jest.fn().mockReturnThis();
    qbFrom = jest.fn().mockReturnThis();
    qbDelete = jest.fn().mockReturnThis();

    const queryBuilder = {
      delete: qbDelete,
      from: qbFrom,
      where: qbWhere,
      andWhere: qbAndWhere,
      execute: qbExecute,
    };
    qbDelete.mockReturnValue(queryBuilder);
    qbFrom.mockReturnValue(queryBuilder);
    qbWhere.mockReturnValue(queryBuilder);
    qbAndWhere.mockReturnValue(queryBuilder);

    subscriptionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncompleteSubscriptionsCleanupCron,
        { provide: getRepositoryToken(Subscription), useValue: subscriptionRepository },
      ],
    }).compile();

    cron = module.get<IncompleteSubscriptionsCleanupCron>(IncompleteSubscriptionsCleanupCron);
  });

  it('issues a set-based DELETE constrained to stale INCOMPLETE rows', async () => {
    await cron.handle();

    // Hard DELETE (not soft, not flip to CANCELLED): an unpaid subscription
    // is not a cancelled subscription. The user never owned it, the admin has
    // nothing to do with it, analytics must not count it.
    expect(qbDelete).toHaveBeenCalled();
    expect(qbFrom).toHaveBeenCalledWith(Subscription);
    expect(qbWhere).toHaveBeenCalledWith('status = :incomplete', {
      incomplete: SubscriptionStatus.INCOMPLETE,
    });
    const andWhereCall = qbAndWhere.mock.calls[0];
    expect(andWhereCall[0]).toBe('updated_at < :threshold');
    expect(andWhereCall[1].threshold).toBeInstanceOf(Date);
    expect(qbExecute).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing matches (idempotent re-run)', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 0 });

    await cron.handle();

    // The WHERE status='incomplete' guard makes the cron race-safe against a
    // concurrent Stripe webhook flipping the same row to ACTIVE: if the row
    // was already promoted, the WHERE no longer matches and DELETE is a
    // no-op. Re-running is therefore always safe.
    expect(qbExecute).toHaveBeenCalledTimes(1);
  });

  it('logs the count when rows are deleted', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 5 });
    const logSpy = jest.spyOn((cron as unknown as { logger: { log: jest.Mock } }).logger, 'log');

    await cron.handle();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Hard-deleted 5'));
  });

  it('stays silent when zero rows match', async () => {
    qbExecute.mockResolvedValueOnce({ affected: 0 });
    const logSpy = jest.spyOn((cron as unknown as { logger: { log: jest.Mock } }).logger, 'log');

    await cron.handle();

    expect(logSpy).not.toHaveBeenCalled();
  });
});
