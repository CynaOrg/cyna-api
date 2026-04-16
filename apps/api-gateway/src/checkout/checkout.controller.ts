import { Controller, Post, Body, Req, Inject, Logger, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { OptionalJwtAuthGuard } from '../auth/guards';
import { Request } from 'express';
import { CheckoutPaymentIntentDto } from './dto/checkout-payment-intent.dto';

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; type: string; role?: string };
}

@Controller('checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('payment-intent')
  async createPaymentIntent(
    @Body() body: CheckoutPaymentIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    this.logger.debug(`createPaymentIntent userId=${userId ?? 'guest'} cartId=${body.cartId}`);

    try {
      const order = await firstValueFrom(
        this.orderClient
          .send(MESSAGE_PATTERNS.ORDER.CREATE_ORDER, {
            userId,
            cartId: body.cartId,
            billingAddress: body.billingAddress,
            shippingAddress: body.shippingAddress,
            email: body.email,
            preferredLanguage: body.preferredLanguage,
            stripePaymentIntentId: '',
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
      this.logger.error(
        `createPaymentIntent FAILED userId=${userId ?? 'guest'} cartId=${body.cartId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw error;
    }
  }
}
