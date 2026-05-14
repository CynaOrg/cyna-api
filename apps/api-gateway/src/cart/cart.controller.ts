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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { BillingPeriod, Public } from '@cyna-api/common';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CurrentUser, SessionId } from '../auth/decorators';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateCartOwner(userId?: string, sessionId?: string): void {
  if (!userId && !sessionId) {
    throw new BadRequestException('Authentication or X-Session-Id header is required');
  }
  if (sessionId && !UUID_REGEX.test(sessionId)) {
    throw new BadRequestException('X-Session-Id must be a valid UUID');
  }
}

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session UUID' })
  @ApiOperation({ summary: 'Get current cart (authenticated or guest)' })
  @ApiResponse({ status: 200, description: 'Cart with enriched product info' })
  async getCart(@CurrentUser('id') userId?: string, @SessionId() sessionId?: string) {
    validateCartOwner(userId, sessionId);
    return this.cartService.getCart(userId, sessionId);
  }

  @Post('items')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session UUID' })
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 201, description: 'Item added, returns updated cart' })
  @ApiResponse({ status: 400, description: 'Product unavailable or insufficient stock' })
  async addItem(
    @Body() dto: AddCartItemDto,
    @CurrentUser('id') userId?: string,
    @SessionId() sessionId?: string,
  ) {
    validateCartOwner(userId, sessionId);
    return this.cartService.addItem(userId, sessionId, dto);
  }

  @Patch('items/:productId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session UUID' })
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiQuery({ name: 'billingPeriod', enum: BillingPeriod, required: false })
  @ApiResponse({ status: 200, description: 'Item updated, returns updated cart' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async updateItem(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
    @Query('billingPeriod') billingPeriod?: BillingPeriod,
    @CurrentUser('id') userId?: string,
    @SessionId() sessionId?: string,
  ) {
    validateCartOwner(userId, sessionId);
    return this.cartService.updateItem(userId, sessionId, productId, dto, billingPeriod);
  }

  @Delete('items/:productId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session UUID' })
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiQuery({ name: 'billingPeriod', enum: BillingPeriod, required: false })
  @ApiResponse({ status: 200, description: 'Item removed, returns updated cart' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeItem(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('billingPeriod') billingPeriod?: BillingPeriod,
    @CurrentUser('id') userId?: string,
    @SessionId() sessionId?: string,
  ) {
    validateCartOwner(userId, sessionId);
    return this.cartService.removeItem(userId, sessionId, productId, billingPeriod);
  }

  @Delete()
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'Guest session UUID' })
  @ApiOperation({ summary: 'Clear entire cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared' })
  async clearCart(@CurrentUser('id') userId?: string, @SessionId() sessionId?: string) {
    validateCartOwner(userId, sessionId);
    return this.cartService.clearCart(userId, sessionId);
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({
    name: 'X-Session-Id',
    required: true,
    description: 'Guest session UUID to merge from',
  })
  @ApiOperation({ summary: 'Merge guest cart into authenticated user cart' })
  @ApiResponse({ status: 201, description: 'Carts merged, returns updated cart' })
  async mergeGuestCart(@CurrentUser('id') userId: string, @SessionId() sessionId?: string) {
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new BadRequestException('X-Session-Id header with valid UUID is required for merge');
    }
    return this.cartService.mergeGuestCart(userId, sessionId);
  }
}
