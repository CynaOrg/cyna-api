import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, BillingPeriod } from '@cyna-api/common';
import { AddCartItemDto, UpdateCartItemDto, MergeCartDto } from './dto';

@Injectable()
export class CartService {
  private readonly TIMEOUT = 10000;

  constructor(
    @Inject(SERVICE_NAMES.ORDER)
    private readonly orderClient: ClientProxy,
  ) {}

  async getCart(userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.GET_CART, { userId });
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM, { userId, dto });
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
    billingPeriod?: BillingPeriod,
  ) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.UPDATE_CART_ITEM, {
      userId,
      productId,
      dto,
      billingPeriod,
    });
  }

  async removeItem(userId: string, productId: string, billingPeriod?: BillingPeriod) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM, {
      userId,
      productId,
      billingPeriod,
    });
  }

  async clearCart(userId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.CLEAR_CART, { userId });
  }

  async mergeCart(userId: string, dto: MergeCartDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ORDER.MERGE_CART, { userId, dto });
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
