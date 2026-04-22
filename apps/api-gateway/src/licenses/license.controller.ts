import {
  Controller,
  Get,
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
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { LicenseResponseDto } from './dto/license-response.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; type: string; role?: string };
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
    return firstValueFrom(
      this.paymentClient
        .send<LicenseResponseDto[]>(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES, {
          userId: req.user.id,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a license by id (owned by authenticated user)' })
  @ApiResponse({ status: 200, type: LicenseResponseDto })
  @ApiResponse({ status: 404, description: 'License not found' })
  async getLicenseById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LicenseResponseDto> {
    return firstValueFrom(
      this.paymentClient
        .send<LicenseResponseDto>(MESSAGE_PATTERNS.PAYMENT.GET_LICENSE_BY_ID, {
          licenseId: id,
          userId: req.user.id,
        })
        .pipe(
          timeout(10000),
          retry(1),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
  }
}
