import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtAdminAuthGuard } from './guards';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService, JwtAuthGuard, JwtAdminAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtAdminAuthGuard],
})
export class AuthModule {}
