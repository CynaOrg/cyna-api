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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiPropertyOptional,
  ApiProperty,
} from '@nestjs/swagger';
import { SERVICE_NAMES, MESSAGE_PATTERNS, SubscriptionStatus } from '@cyna-api/common';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';
import { IsOptional, IsEnum, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

class AdminSubscriptionQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: ['cancel', 'reactivate', 'pause'] })
  @IsString()
  action: 'cancel' | 'reactivate' | 'pause';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an RPC error to an HttpException Observable so the
 * GlobalExceptionFilter can return the proper status code and message.
 */
function rpcToHttpError(err: unknown): Observable<never> {
  if (err instanceof TimeoutError) {
    return throwError(() => new HttpException('Payment service timeout', 503));
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

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('Admin - Subscriptions')
@Controller('admin/payments/subscriptions')
@UseGuards(JwtAdminAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SubscriptionAdminController {
  constructor(
    @Inject(SERVICE_NAMES.PAYMENT)
    private readonly paymentClient: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all subscriptions (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of subscriptions' })
  async findAll(@Query() query: AdminSubscriptionQueryDto) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS, {
          admin: true,
          ...query,
        })
        .pipe(timeout(5000), retry(2), catchError(rpcToHttpError)),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription detail (admin)' })
  @ApiParam({ name: 'id', description: 'Subscription ID' })
  @ApiResponse({ status: 200, description: 'Subscription details' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTION, {
          subscriptionId: id,
        })
        .pipe(timeout(5000), retry(2), catchError(rpcToHttpError)),
    );
  }

  @Patch(':id/status')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update subscription status (super_admin only)' })
  @ApiParam({ name: 'id', description: 'Subscription ID' })
  @ApiResponse({ status: 200, description: 'Subscription status updated' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateSubscriptionStatusDto) {
    const pattern =
      dto.action === 'cancel'
        ? MESSAGE_PATTERNS.PAYMENT.CANCEL_SUBSCRIPTION
        : MESSAGE_PATTERNS.PAYMENT.REACTIVATE_SUBSCRIPTION;

    return firstValueFrom(
      this.paymentClient
        .send(pattern, { subscriptionId: id, cancelAtPeriodEnd: false })
        .pipe(timeout(10000), retry(1), catchError(rpcToHttpError)),
    );
  }
}
