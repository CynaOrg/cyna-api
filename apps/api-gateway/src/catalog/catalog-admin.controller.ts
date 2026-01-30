import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAdminAuthGuard } from '../auth/guards';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ProductQueryDto,
  CreateProductDto,
  UpdateProductDto,
  AddImageDto,
  ReorderImagesDto,
  UpdateStockDto,
} from './dto';

@ApiTags('Admin - Catalog')
@Controller('admin/catalog')
@UseGuards(JwtAdminAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CatalogAdminController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==================== Categories ====================

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories (admin)' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async findAllCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.findAllCategories(query);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Patch('categories/:categoryId')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async updateCategory(@Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryDto) {
    return this.catalogService.updateCategory(categoryId, dto);
  }

  @Delete('categories/:categoryId')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category has associated products' })
  async deleteCategory(@Param('categoryId') categoryId: string) {
    return this.catalogService.deleteCategory(categoryId);
  }

  // ==================== Products ====================

  @Get('products')
  @ApiOperation({ summary: 'Get all products (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findAllProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.findAllProducts(query);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
  async createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Get('products/:productId')
  @ApiOperation({ summary: 'Get product by ID (admin)' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findProductById(@Param('productId') productId: string) {
    return this.catalogService.findProductById(productId);
  }

  @Patch('products/:productId')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
  async updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(productId, dto);
  }

  @Delete('products/:productId')
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async deleteProduct(@Param('productId') productId: string) {
    return this.catalogService.deleteProduct(productId);
  }

  // ==================== Product Images ====================

  @Post('products/:productId/images')
  @ApiOperation({ summary: 'Add an image to a product' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 201, description: 'Image added' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addProductImage(@Param('productId') productId: string, @Body() dto: AddImageDto) {
    return this.catalogService.addProductImage(
      productId,
      dto.imageUrl,
      dto.altTextFr,
      dto.altTextEn,
      dto.isPrimary,
    );
  }

  @Delete('products/:productId/images/:imageId')
  @ApiOperation({ summary: 'Delete a product image' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiParam({ name: 'imageId', description: 'Image ID' })
  @ApiResponse({ status: 200, description: 'Image deleted' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async deleteProductImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.catalogService.deleteProductImage(productId, imageId);
  }

  @Patch('products/:productId/images/reorder')
  @ApiOperation({ summary: 'Reorder product images' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Images reordered' })
  @ApiResponse({ status: 400, description: 'Invalid image IDs' })
  async reorderProductImages(@Param('productId') productId: string, @Body() dto: ReorderImagesDto) {
    return this.catalogService.reorderProductImages(productId, dto.imageIds);
  }

  // ==================== Stock ====================

  @Patch('products/:productId/stock')
  @ApiOperation({ summary: 'Update product stock' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Stock updated' })
  @ApiResponse({ status: 400, description: 'Stock management not applicable' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async updateProductStock(@Param('productId') productId: string, @Body() dto: UpdateStockDto) {
    return this.catalogService.updateStock(productId, dto);
  }

  @Get('stock/alerts')
  @ApiOperation({ summary: 'Get products with low stock' })
  @ApiResponse({ status: 200, description: 'List of products with low stock' })
  async getStockAlerts() {
    return this.catalogService.getStockAlerts();
  }
}
