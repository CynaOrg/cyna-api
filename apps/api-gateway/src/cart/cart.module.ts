import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';

@Module({
  imports: [ConfigModule],
  controllers: [CartController],
  providers: [CartService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [CartService],
})
export class CartModule {}
