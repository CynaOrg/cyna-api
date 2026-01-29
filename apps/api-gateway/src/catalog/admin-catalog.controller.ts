import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAdminAuthGuard } from '../auth/guards';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ProductQueryDto,
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  AddProductImageDto,
  UpdateProductImageDto,
  ReorderImagesDto,
  AddProductCharacteristicDto,
  UpdateProductCharacteristicDto,
  BulkUpsertCharacteristicsDto,
} from './dto';

@ApiTags('Catalog Admin')
@Controller('catalog/admin')
@UseGuards(JwtAdminAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==================== Categories ====================

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all categories (admin)' })
  @ApiResponse({
    status: 200,
    description: 'List of categories with admin data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.getCategoriesAdmin(query);
  }

  @Get('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get category by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category details' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryById(@Param('id') id: string) {
    return this.catalogService.getCategoryById(id);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Put('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({
    status: 200,
    description: 'Category deleted',
    schema: { example: { success: true, message: 'Category deleted successfully' } },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 400, description: 'Category has products' })
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }

  // ==================== Products ====================

  @Get('products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all products (admin)' })
  @ApiResponse({
    status: 200,
    description: 'List of products with admin data',
  })
  async getProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.getProductsAdmin(query);
  }

  @Get('products/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductById(@Param('id') id: string) {
    return this.catalogService.getProductById(id);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
  async createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Put('products/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product deleted',
    schema: { example: { success: true, message: 'Product deleted successfully' } },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(id);
  }

  @Patch('products/:id/stock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product stock' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Stock updated',
    schema: {
      example: {
        productId: 'uuid',
        sku: 'SOC-PREM-001',
        productType: 'physical',
        stockQuantity: 100,
        reservedQuantity: 5,
        availableQuantity: 95,
        stockAlertThreshold: 10,
        stockStatus: 'in_stock',
        isAvailable: true,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Not a physical product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.catalogService.updateStock(id, dto);
  }

  // ==================== Product Images ====================

  @Get('products/:id/images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product images' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'List of product images' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductImages(@Param('id') productId: string) {
    return this.catalogService.getProductImages(productId);
  }

  @Post('products/:id/images')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product image' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 201, description: 'Image added' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addProductImage(
    @Param('id') productId: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.catalogService.addProductImage(productId, dto);
  }

  @Put('images/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product image' })
  @ApiParam({ name: 'id', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image updated' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async updateProductImage(
    @Param('id') id: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.catalogService.updateProductImage(id, dto);
  }

  @Delete('images/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product image' })
  @ApiParam({ name: 'id', description: 'Image UUID' })
  @ApiResponse({
    status: 200,
    description: 'Image deleted',
    schema: { example: { success: true, message: 'Image deleted successfully' } },
  })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async deleteProductImage(@Param('id') id: string) {
    return this.catalogService.deleteProductImage(id);
  }

  @Patch('images/:id/primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set image as primary' })
  @ApiParam({ name: 'id', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image set as primary' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async setPrimaryImage(@Param('id') id: string) {
    return this.catalogService.setPrimaryImage(id);
  }

  @Patch('products/:id/images/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder product images' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Images reordered' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async reorderImages(
    @Param('id') productId: string,
    @Body() dto: ReorderImagesDto,
  ) {
    return this.catalogService.reorderImages(productId, dto);
  }

  // ==================== Product Characteristics ====================

  @Get('products/:id/characteristics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product characteristics' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'List of product characteristics' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductCharacteristics(@Param('id') productId: string) {
    return this.catalogService.getProductCharacteristics(productId);
  }

  @Post('products/:id/characteristics')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product characteristic' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 201, description: 'Characteristic added' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'Characteristic key already exists' })
  async addProductCharacteristic(
    @Param('id') productId: string,
    @Body() dto: AddProductCharacteristicDto,
  ) {
    return this.catalogService.addProductCharacteristic(productId, dto);
  }

  @Put('characteristics/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product characteristic' })
  @ApiParam({ name: 'id', description: 'Characteristic UUID' })
  @ApiResponse({ status: 200, description: 'Characteristic updated' })
  @ApiResponse({ status: 404, description: 'Characteristic not found' })
  async updateProductCharacteristic(
    @Param('id') id: string,
    @Body() dto: UpdateProductCharacteristicDto,
  ) {
    return this.catalogService.updateProductCharacteristic(id, dto);
  }

  @Delete('characteristics/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product characteristic' })
  @ApiParam({ name: 'id', description: 'Characteristic UUID' })
  @ApiResponse({
    status: 200,
    description: 'Characteristic deleted',
    schema: { example: { success: true, message: 'Characteristic deleted successfully' } },
  })
  @ApiResponse({ status: 404, description: 'Characteristic not found' })
  async deleteProductCharacteristic(@Param('id') id: string) {
    return this.catalogService.deleteProductCharacteristic(id);
  }

  @Put('products/:id/characteristics/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk upsert product characteristics' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Characteristics upserted',
    schema: {
      example: {
        created: 2,
        updated: 3,
        characteristics: [],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async bulkUpsertCharacteristics(
    @Param('id') productId: string,
    @Body() dto: BulkUpsertCharacteristicsDto,
  ) {
    return this.catalogService.bulkUpsertCharacteristics(productId, dto);
  }
}
