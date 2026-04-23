import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { IsNull, LessThan, Repository } from 'typeorm';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  EVENT_PATTERNS,
  Language,
  coerceLanguage,
  CartAbandonedEvent,
} from '@cyna-api/common';
import { Cart } from '../entities/cart.entity';

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class CartAbandonedCron {
  private readonly logger = new Logger(CartAbandonedCron.name);

  constructor(
    @InjectRepository(Cart) private readonly cartRepository: Repository<Cart>,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
  ) {}

  // Run hourly — the 24h threshold is coarse so there's no value in tighter
  // scheduling. Guest carts (session_id only) are skipped because we don't
  // have an email for them.
  @Cron(CronExpression.EVERY_HOUR)
  async handle(): Promise<void> {
    const threshold = new Date(Date.now() - ABANDONED_AFTER_MS);
    const candidates = await this.cartRepository.find({
      where: {
        abandonedNotifiedAt: IsNull(),
        updatedAt: LessThan(threshold),
      },
      take: 50,
    });

    const withItems = candidates.filter((c) => c.userId && c.items && c.items.length > 0);
    if (withItems.length === 0) return;

    this.logger.log(`Cart-abandoned sweep: ${withItems.length} cart(s) eligible`);

    for (const cart of withItems) {
      try {
        const user = await firstValueFrom(
          this.authClient.send(MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID, { userId: cart.userId }).pipe(
            timeout(3000),
            catchError((err) => throwError(() => err)),
          ),
        );
        if (!user?.email) {
          this.logger.warn(
            `Skipping abandoned cart ${cart.id}: user ${cart.userId} not found or has no email`,
          );
          continue;
        }
        const itemsSummary = cart.items
          .map((it) => {
            const snapshot = (
              it as unknown as { productSnapshot?: { nameFr?: string; nameEn?: string } }
            ).productSnapshot;
            const name = snapshot?.nameFr ?? snapshot?.nameEn ?? 'Item';
            return `${name} x${(it as unknown as { quantity?: number }).quantity ?? 1}`;
          })
          .join(', ');
        const event: CartAbandonedEvent = {
          cartId: cart.id,
          userId: cart.userId!,
          email: user.email,
          language: coerceLanguage(user.preferredLanguage ?? Language.FR),
          itemsSummary,
          itemCount: cart.items.length,
        };
        this.notificationClient.emit(EVENT_PATTERNS.ORDER.CHECKOUT_EXPIRED, event);
        cart.abandonedNotifiedAt = new Date();
        await this.cartRepository.save(cart);
      } catch (err) {
        this.logger.error(
          `Failed to notify abandoned cart ${cart.id}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }
}
