import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, BillingPeriod } from '@cyna-api/common';
import { AddCartItemDto, UpdateCartItemDto } from './dto';

@Injectable()
export class CartService {
  private readonly TIMEOUT = 10000;

  constructor(
    @Inject(SERVICE_NAMES.ORDER)
    private readonly orderClient: ClientProxy,
  ) {}

  async getCart(userId?: string, sessionId?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.GET_CART, { userId, sessionId });
  }

  async addItem(userId?: string, sessionId?: string, dto?: AddCartItemDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM, { userId, sessionId, dto });
  }

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

  async clearCart(userId?: string, sessionId?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.CLEAR_CART, { userId, sessionId });
  }

  async mergeGuestCart(userId: string, sessionId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART, { userId, sessionId });
  }

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.orderClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Order service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
