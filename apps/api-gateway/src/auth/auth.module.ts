import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
