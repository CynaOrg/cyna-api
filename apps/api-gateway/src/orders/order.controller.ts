import { Controller, Get, Param, Req, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, throwError, TimeoutError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { JwtAuthGuard } from '../auth/guards';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; type: string; role?: string };
}

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderGatewayController {
  constructor(@Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy) {}

  @Get()
  async getOrders(@Req() req: AuthenticatedRequest) {
    return firstValueFrom(
      this.orderClient
        .send(MESSAGE_PATTERNS.ORDER.GET_ORDERS, {
          userId: req.user.id,
        })
        .pipe(
          timeout(5000),
          retry(2),
          catchError((err) => {
            if (err instanceof TimeoutError) {
              return throwError(() => ({ statusCode: 503, message: 'Order service timeout' }));
            }
            return throwError(() => err);
          }),
        ),
    );
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return firstValueFrom(
      this.orderClient
        .send(MESSAGE_PATTERNS.ORDER.GET_ORDER, {
          orderId: id,
          userId: req.user.id,
        })
        .pipe(
          timeout(5000),
          retry(2),
          catchError((err) => {
            if (err instanceof TimeoutError) {
              return throwError(() => ({ statusCode: 503, message: 'Order service timeout' }));
            }
            return throwError(() => err);
          }),
        ),
    );
  }
}
