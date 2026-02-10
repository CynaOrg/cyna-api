import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BillingPeriod } from '@cyna-api/common';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto, MergeCartDto } from './dto';

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user cart' })
  @ApiResponse({ status: 200, description: 'User cart with enriched product info' })
  async getCart(@CurrentUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 201, description: 'Item added, returns updated cart' })
  @ApiResponse({ status: 400, description: 'Product unavailable or insufficient stock' })
  async addItem(@CurrentUser('id') userId: string, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(userId, dto);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiQuery({ name: 'billingPeriod', enum: BillingPeriod, required: false })
  @ApiResponse({ status: 200, description: 'Item updated, returns updated cart' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async updateItem(
    @CurrentUser('id') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
    @Query('billingPeriod') billingPeriod?: BillingPeriod,
  ) {
    return this.cartService.updateItem(userId, productId, dto, billingPeriod);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiQuery({ name: 'billingPeriod', enum: BillingPeriod, required: false })
  @ApiResponse({ status: 200, description: 'Item removed, returns updated cart' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeItem(
    @CurrentUser('id') userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('billingPeriod') billingPeriod?: BillingPeriod,
  ) {
    return this.cartService.removeItem(userId, productId, billingPeriod);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear entire cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared' })
  async clearCart(@CurrentUser('id') userId: string) {
    return this.cartService.clearCart(userId);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge anonymous cart into user cart' })
  @ApiResponse({ status: 201, description: 'Carts merged, returns updated cart' })
  async mergeCart(@CurrentUser('id') userId: string, @Body() dto: MergeCartDto) {
    return this.cartService.mergeCart(userId, dto);
  }
}
