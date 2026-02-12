import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Inject,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { JwtAuthGuard } from '../auth/guards';

/**
 * Convert an RPC error to an HttpException so the GlobalExceptionFilter
 * can return the proper status code and message to the client.
 */
function rpcToHttpError(err: any): never {
  if (err instanceof TimeoutError) {
    throw new HttpException('Payment service timeout', 503);
  }
  const statusCode = err?.statusCode || err?.status || 500;
  const message = err?.message || 'Internal server error';
  throw new HttpException(message, statusCode);
}

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionController {
  constructor(@Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy) {}

  @Post()
  async createSubscription(@Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.CREATE_SUBSCRIPTION, {
          userId: req.user.id,
          productId: body.productId,
          billingPeriod: body.billingPeriod,
          billingAddress: body.billingAddress,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => {
            rpcToHttpError(err);
          }),
        ),
    );
  }

  @Get()
  async getSubscriptions(@Req() req: any) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS, {
          userId: req.user.id,
        })
        .pipe(
          timeout(5000),
          retry(2),
          catchError((err) => {
            rpcToHttpError(err);
          }),
        ),
    );
  }

  @Get(':id')
  async getSubscription(@Param('id') id: string, @Req() req: any) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION, {
          subscriptionId: id,
        })
        .pipe(
          timeout(5000),
          retry(2),
          catchError((err) => {
            rpcToHttpError(err);
          }),
        ),
    );
  }

  @Post(':id/cancel')
  async cancelSubscription(
    @Param('id') id: string,
    @Body() body: { cancelAtPeriodEnd?: boolean },
    @Req() req: any,
  ) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION, {
          subscriptionId: id,
          userId: req.user.id,
          cancelAtPeriodEnd: body.cancelAtPeriodEnd ?? true,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => {
            rpcToHttpError(err);
          }),
        ),
    );
  }
}
