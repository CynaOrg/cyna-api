import {
  Controller,
  Post,
  Body,
  Req,
  Inject,
  Logger,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Public } from '@cyna-api/common';
import { OptionalJwtAuthGuard } from '../auth/guards';
import { Request } from 'express';
import { CheckoutPaymentIntentDto } from './dto/checkout-payment-intent.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; type: string; role?: string };
}

@ApiTags('Payments')
@Controller('checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('payment-intent')
  @ApiOperation({ summary: 'Create a Stripe PaymentIntent for the current cart' })
  @ApiResponse({ status: 201, type: PaymentIntentResponseDto })
  async createPaymentIntent(
    @Body() body: CheckoutPaymentIntentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaymentIntentResponseDto> {
    const userId = req.user?.id;
    // Prefer JWT email (authoritative for authenticated users), then body variants
    // for guests or when the cookie did not travel to the gateway.
    const email = req.user?.email ?? body.email ?? body.guestEmail;
    this.logger.debug(
      `createPaymentIntent userId=${userId ?? 'guest'} cartId=${body.cartId} email=${email ?? 'none'}`,
    );

    if (!email) {
      throw new BadRequestException('Customer email is required');
    }

    try {
      const order = await firstValueFrom(
        this.orderClient
          .send(MESSAGE_PATTERNS.ORDER.CREATE_ORDER, {
            userId,
            cartId: body.cartId,
            billingAddress: body.billingAddress,
            shippingAddress: body.shippingAddress,
            email,
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

      // If the order already has a PaymentIntent (either because we just
      // returned an idempotent pending order, or because a previous attempt
      // already created one), try to reuse it. Only create a fresh intent
      // when none exists or the existing one is no longer payable.
      let paymentIntent: {
        clientSecret: string;
        paymentIntentId: string;
        amount: number;
        currency: string;
      } | null = null;

      if (order.stripePaymentIntentId) {
        try {
          const retrieved = await firstValueFrom(
            this.paymentClient
              .send(MESSAGE_PATTERNS.PAYMENT.RETRIEVE_PAYMENT_INTENT, {
                paymentIntentId: order.stripePaymentIntentId,
              })
              .pipe(
                timeout(5000),
                catchError(() => throwError(() => null)),
              ),
          );
          if (retrieved?.reusable && retrieved.clientSecret) {
            paymentIntent = {
              clientSecret: retrieved.clientSecret,
              paymentIntentId: retrieved.paymentIntentId,
              amount: retrieved.amount,
              currency: retrieved.currency,
            };
            this.logger.debug(
              `Reusing PaymentIntent ${retrieved.paymentIntentId} for order ${order.id}`,
            );
          }
        } catch {
          // Fall through to create a new one.
        }
      }

      if (!paymentIntent) {
        const created = await firstValueFrom(
          this.paymentClient
            .send(MESSAGE_PATTERNS.PAYMENT.CREATE_PAYMENT_INTENT, {
              orderId: order.id,
              amount: order.total,
              currency: order.currency || 'EUR',
              userId,
              guestEmail: email,
            })
            .pipe(
              timeout(10000),
              retry(1),
              catchError((err) => {
                if (err instanceof TimeoutError) {
                  return throwError(() => ({
                    statusCode: 503,
                    message: 'Payment service timeout',
                  }));
                }
                return throwError(() => err);
              }),
            ),
        );
        paymentIntent = created;

        this.orderClient.emit(MESSAGE_PATTERNS.ORDER.UPDATE_ORDER_STATUS.cmd, {
          orderId: order.id,
          stripePaymentIntentId: created.paymentIntentId,
        });
      }

      if (!paymentIntent) {
        throw new BadRequestException('Failed to obtain payment intent');
      }

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
