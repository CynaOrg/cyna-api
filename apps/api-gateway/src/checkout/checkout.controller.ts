import { Controller, Post, Body, Req, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { Public, SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';

@Controller('checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
  ) {}

  @Public()
  @Post('payment-intent')
  async createPaymentIntent(@Body() body: any, @Req() req: any) {
    const userId = req.user?.id;
    this.logger.debug(
      `createPaymentIntent called with body: ${JSON.stringify(body)}, userId: ${userId}`,
    );

    try {
      // 1. Create order from cart
      const order = await firstValueFrom(
        this.orderClient
          .send(MESSAGE_PATTERNS.ORDER.CREATE_ORDER, {
            userId,
            cartId: body.cartId,
            billingAddress: body.billingAddress,
            shippingAddress: body.shippingAddress,
            email: body.email,
            stripePaymentIntentId: '', // Will be updated after PI creation
          })
          .pipe(
            timeout(10000),
            retry(1),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(() => ({ statusCode: 503, message: 'Order service timeout' }));
              }
              return throwError(() => err);
            }),
          ),
      );

      // 2. Create payment intent using the order's server-calculated total
      const paymentIntent = await firstValueFrom(
        this.paymentClient
          .send(MESSAGE_PATTERNS.PAYMENT.CREATE_PAYMENT_INTENT, {
            orderId: order.id,
            amount: order.total,
            currency: order.currency || 'EUR',
            userId,
            guestEmail: body.email,
          })
          .pipe(
            timeout(10000),
            retry(1),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(() => ({ statusCode: 503, message: 'Payment service timeout' }));
              }
              return throwError(() => err);
            }),
          ),
      );

      // 3. Update order with payment intent ID
      this.orderClient.emit(MESSAGE_PATTERNS.ORDER.UPDATE_ORDER_STATUS.cmd, {
        orderId: order.id,
        stripePaymentIntentId: paymentIntent.paymentIntentId,
      });

      return {
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      };
    } catch (error) {
      this.logger.error(`createPaymentIntent FAILED: ${JSON.stringify(error)}`);
      this.logger.error(`Error stack: ${error?.stack || 'no stack'}`);
      throw error;
    }
  }
}
