import { Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, retry, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, BillingPeriod } from '@cyna-api/common';
import { AddCartItemDto, UpdateCartItemDto } from './dto';

@Injectable()
export class CartService {
  private readonly TIMEOUT = 10000;
  private readonly logger = new Logger(CartService.name);

  constructor(
    @Inject(SERVICE_NAMES.ORDER)
    private readonly orderClient: ClientProxy,
  ) {}

  async getCart(userId?: string, sessionId?: string) {
    return this.sendMessage(
      MESSAGE_PATTERNS.ORDER.GET_CART,
      { userId, sessionId },
      { retry: true },
    );
  }

  // No retry: mutation, must stay idempotent
  async addItem(userId?: string, sessionId?: string, dto?: AddCartItemDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM, { userId, sessionId, dto });
  }

  // No retry: mutation, must stay idempotent
  async updateItem(
    userId?: string,
    sessionId?: string,
    productId?: string,
    dto?: UpdateCartItemDto,
    billingPeriod?: BillingPeriod,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.UPDATE_CART_ITEM, {
      userId,
      sessionId,
      productId,
      dto,
      billingPeriod,
    });
  }

  // No retry: mutation, must stay idempotent
  async removeItem(
    userId?: string,
    sessionId?: string,
    productId?: string,
    billingPeriod?: BillingPeriod,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM, {
      userId,
      sessionId,
      productId,
      billingPeriod,
    });
  }

  // No retry: mutation, must stay idempotent
  async clearCart(userId?: string, sessionId?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.CLEAR_CART, { userId, sessionId });
  }

  // No retry: mutation, must stay idempotent
  async mergeGuestCart(userId: string, sessionId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART, { userId, sessionId });
  }

  private async sendMessage<T>(
    pattern: { cmd: string },
    data: T,
    options: { retry?: boolean } = {},
  ) {
    const obs = this.orderClient.send(pattern, data).pipe(timeout(this.TIMEOUT));
    const withRetry = options.retry ? obs.pipe(retry({ count: 2, delay: 1000 })) : obs;
    return firstValueFrom(
      withRetry.pipe(
        catchError((err) => {
          this.logger.error(`Order service error [${pattern.cmd}]: ${JSON.stringify(err)}`);

          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err?.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Order service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          // Handle generic RPC errors (NestJS wraps non-RpcException as { message, status: 'error' })
          const message = err?.message || (typeof err === 'string' ? err : 'Order service error');
          return throwError(
            () =>
              new HttpException(
                { message, error: 'ORDER_SERVICE_ERROR' },
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
          );
        }),
      ),
    );
  }
}
