import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Inject,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import {
  Observable,
  firstValueFrom,
  timeout,
  retry,
  catchError,
  throwError,
  TimeoutError,
} from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';
import { AdminOrderQueryDto, UpdateOrderStatusDto } from './dto';

/**
 * Convert an RPC error to an HttpException so the
 * GlobalExceptionFilter can return the proper status code and message.
 */
function rpcToHttpError(err: unknown): Observable<never> {
  if (err instanceof TimeoutError) {
    return throwError(() => new HttpException('Order service timeout', 503));
  }
  const errObj = err as Record<string, unknown> | undefined;
  const payload =
    typeof errObj?.message === 'object' ? (errObj.message as Record<string, unknown>) : errObj;
  const statusCode = typeof payload?.statusCode === 'number' ? payload.statusCode : 500;
  const message =
    (typeof payload?.message === 'string' ? payload.message : (errObj?.message as string)) ||
    'Internal server error';
  return throwError(() => new HttpException(message, statusCode));
}

@ApiTags('Admin - Orders')
@Controller('admin/orders')
@UseGuards(JwtAdminAuthGuard, SuperAdminGuard)
@ApiBearerAuth('JWT-auth')
export class OrderAdminController {
  constructor(@Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy) {}

  @Get()
  @ApiOperation({ summary: 'List all orders (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async getOrders(@Query() query: AdminOrderQueryDto) {
    return firstValueFrom(
      this.orderClient.send(MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS, { ...query }).pipe(
        timeout(5000),
        retry(2),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order details (admin)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(@Param('orderId') orderId: string) {
    return firstValueFrom(
      this.orderClient.send(MESSAGE_PATTERNS.ORDER.GET_ORDER, { orderId }).pipe(
        timeout(5000),
        retry(2),
        catchError((err) => rpcToHttpError(err)),
      ),
    );
  }

  @Patch(':orderId/status')
  @ApiOperation({ summary: 'Update order status (super admin only)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateOrderStatus(@Param('orderId') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    return firstValueFrom(
      this.orderClient
        .send(MESSAGE_PATTERNS.ORDER.ADMIN_UPDATE_STATUS, {
          orderId,
          status: dto.status,
          notes: dto.notes,
          trackingNumber: dto.trackingNumber,
          trackingUrl: dto.trackingUrl,
        })
        .pipe(
          timeout(5000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
  }
}
