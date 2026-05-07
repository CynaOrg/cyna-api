import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  Req,
  Inject,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import {
  Observable,
  firstValueFrom,
  timeout,
  catchError,
  throwError,
  TimeoutError,
} from 'rxjs';
import { Public, SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { AuthService } from './auth.service';
import { AdminLoginDto, Verify2FADto, Resend2FADto, RefreshTokenDto, LogoutDto } from './dto';
import { JwtAdminAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { RequestUser } from './interfaces';

interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * Convert an RPC error to an HttpException so the
 * GlobalExceptionFilter can return the proper status code and message.
 */
function rpcToHttpError(err: unknown): Observable<never> {
  if (err instanceof TimeoutError) {
    return throwError(() => new HttpException('Auth service timeout', 503));
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

const isProduction =
  process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_NAME;

const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

const ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

@ApiTags('Auth')
@Controller('auth/admin')
@UseGuards(JwtAdminAuthGuard)
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
  ) {}

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get the currently authenticated admin profile' })
  @ApiResponse({ status: 200, description: 'Authenticated admin profile' })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Admin access required or account disabled' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async me(@Req() req: AuthenticatedRequest): Promise<unknown> {
    // No retry on this read: a 404 ADMIN_NOT_FOUND or 403 ACCOUNT_DISABLED is
    // a business outcome, not a transient failure — retrying triples latency
    // and the gateway's RPC client already handles transient connection drops.
    return firstValueFrom(
      this.authClient
        .send(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ME, { adminId: req.user.id })
        .pipe(
          timeout(5000),
          catchError((err) => rpcToHttpError(err)),
        ),
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login (Step 1) - Sends 2FA code' })
  @ApiResponse({
    status: 200,
    description: '2FA code sent to email',
    schema: {
      example: {
        requires2FA: true,
        tempToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        message: 'Verification code sent to your email',
        expiresInMinutes: 5,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account disabled' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min for 2FA attempts
  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login (Step 2) - Verify 2FA code' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 900,
        admin: {
          id: 'uuid',
          email: 'admin@cyna.io',
          firstName: 'Super',
          lastName: 'Admin',
          role: 'super_admin',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 401, description: 'Invalid temp token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async verify2FA(@Body() dto: Verify2FADto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.adminVerify2FA(dto);

    // Set refresh token as HTTP-only cookie
    if (result.refreshToken) {
      res.cookie('admin_refresh_token', result.refreshToken, ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS);
      // Return response without refreshToken in body
      delete result.refreshToken;
    }

    return result;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 req/5min
  @Post('resend-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend 2FA code' })
  @ApiResponse({
    status: 200,
    description: 'New 2FA code sent',
    schema: {
      example: {
        requires2FA: true,
        tempToken: 'new-temp-token...',
        message: 'New verification code sent',
        expiresInMinutes: 5,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid temp token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resend2FA(@Body() dto: Resend2FADto) {
    return this.authService.adminResend2FA(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh admin access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
  ) {
    // Get refresh token from cookie first, then fallback to body
    const refreshToken = req.cookies?.['admin_refresh_token'] || dto.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const result = await this.authService.adminRefreshToken({ refreshToken });

    // Set new refresh token cookie
    if (result.refreshToken) {
      res.cookie('admin_refresh_token', result.refreshToken, ADMIN_REFRESH_TOKEN_COOKIE_OPTIONS);
      // Return response without refreshToken in body
      delete result.refreshToken;
    }

    return result;
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async logout(
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LogoutDto,
  ) {
    // Get refresh token from cookie first, then fallback to body
    const refreshToken = req.cookies?.['admin_refresh_token'] || dto.refreshToken;

    await this.authService.adminLogout(adminId, { refreshToken });

    // Clear refresh token cookie
    res.clearCookie('admin_refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }
}
