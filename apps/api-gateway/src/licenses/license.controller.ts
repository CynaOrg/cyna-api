import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Inject,
  UseGuards,
  HttpException,
  ParseUUIDPipe,
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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SERVICE_NAMES, MESSAGE_PATTERNS, Public } from '@cyna-api/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { LicenseResponseDto } from './dto/license-response.dto';
import { ActivateLicenseDto } from './dto/activate-license.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; type: string; role?: string };
}

/**
 * Raw license shape as returned by the payment-service (TypeORM entity).
 * Intentionally NOT the same as LicenseResponseDto: internal fields like
 * userId must be stripped before returning to the client.
 */
interface RawLicense {
  id: string;
  licenseKey: string;
  productSnapshot: { nameFr: string; nameEn: string; slug: string };
  orderId: string;
  productId: string;
  status: string;
  activatedAt: string | Date | null;
  expiresAt: string | Date | null;
  email: string;
  createdAt: string | Date;
  [key: string]: unknown;
}

/**
 * Map the raw license entity to the public DTO, stripping internal fields
 * (userId and any future BaseEntity columns) before returning to the client.
 * Defense-in-depth against accidental field leakage.
 */
function toLicenseResponseDto(raw: RawLicense): LicenseResponseDto {
  return {
    id: raw.id,
    licenseKey: raw.licenseKey,
    productSnapshot: raw.productSnapshot,
    orderId: raw.orderId,
    productId: raw.productId,
    status: raw.status as LicenseResponseDto['status'],
    activatedAt: raw.activatedAt as Date | null,
    expiresAt: raw.expiresAt as Date | null,
    email: raw.email,
    createdAt: raw.createdAt as Date,
  };
}

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

@ApiTags('licenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('licenses')
export class LicenseController {
  constructor(@Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy) {}

  @Get()
  @ApiOperation({ summary: 'List authenticated user licenses' })
  @ApiResponse({ status: 200, type: [LicenseResponseDto] })
  async getMyLicenses(@Req() req: AuthenticatedRequest): Promise<LicenseResponseDto[]> {
    const raw = await firstValueFrom(
      this.paymentClient
        .send<RawLicense[]>(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES, {
          userId: req.user.id,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
    return raw.map(toLicenseResponseDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a license by id (owned by authenticated user)' })
  @ApiResponse({ status: 200, type: LicenseResponseDto })
  @ApiResponse({ status: 404, description: 'License not found' })
  async getLicenseById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LicenseResponseDto> {
    const raw = await firstValueFrom(
      this.paymentClient
        .send<RawLicense>(MESSAGE_PATTERNS.PAYMENT.GET_LICENSE_BY_ID, {
          licenseId: id,
          userId: req.user.id,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
    return toLicenseResponseDto(raw);
  }

  @Public()
  @Post('activate')
  @ApiOperation({ summary: 'Activate a license using a one-shot email token' })
  @ApiResponse({ status: 200, type: LicenseResponseDto })
  @ApiResponse({ status: 404, description: 'Invalid or expired activation link' })
  async activateLicense(@Body() dto: ActivateLicenseDto): Promise<LicenseResponseDto> {
    const raw = await firstValueFrom(
      this.paymentClient
        .send<RawLicense>(MESSAGE_PATTERNS.PAYMENT.ACTIVATE_LICENSE, { token: dto.token })
        .pipe(
          timeout(10000),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
    return toLicenseResponseDto(raw);
  }
}
