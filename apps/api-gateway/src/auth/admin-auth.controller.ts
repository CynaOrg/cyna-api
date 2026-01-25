import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  Verify2FADto,
  Resend2FADto,
  RefreshTokenDto,
  LogoutDto,
} from './dto';

@ApiTags('Auth')
@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

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
  async adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

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
        refreshToken: 'abc123...',
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
  async verify2FA(@Body() dto: Verify2FADto) {
    return this.authService.adminVerify2FA(dto);
  }

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
  async resend2FA(@Body() dto: Resend2FADto) {
    return this.authService.adminResend2FA(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh admin access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.adminRefreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Request() req: any, @Body() dto: LogoutDto) {
    // TODO: Extract adminId from JWT token when auth guard is implemented
    const adminId = req.user?.id || 'anonymous';
    return this.authService.adminLogout(adminId, dto);
  }
}
