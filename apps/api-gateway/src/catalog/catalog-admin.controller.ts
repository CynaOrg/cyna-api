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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ProductQueryDto,
  CreateProductDto,
  UpdateProductDto,
  AddImageDto,
  ReorderImagesDto,
  ReorderCategoriesDto,
  UpdateStockDto,
  RequestUploadUrlDto,
  ConfirmUploadDto,
  BulkDeleteProductsDto,
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
  @ApiResponse({
    status: 200,
    description: 'List of categories with both FR and EN fields exposed',
  })
  async findAllCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.findAllCategoriesAdmin(query);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category slug already exists' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  // IMPORTANT: Static routes must come before parameterized routes
  @Patch('categories/reorder')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Reorder categories' })
  @ApiResponse({ status: 200, description: 'Categories reordered' })
  @ApiResponse({ status: 400, description: 'Invalid category IDs' })
  async reorderCategories(@Body() dto: ReorderCategoriesDto) {
    return this.catalogService.reorderCategories(dto.categoryIds);
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

  // IMPORTANT: Static routes must come before parameterized routes
  @Post('products/bulk-delete')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Bulk delete products' })
  @ApiResponse({
    status: 200,
    description: 'Returns the number of deleted products and the list of failed IDs',
  })
  @ApiResponse({ status: 400, description: 'Invalid product IDs' })
  async bulkDeleteProducts(
    @Body() dto: BulkDeleteProductsDto,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    return this.catalogService.bulkDeleteProducts(dto.productIds);
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

  @Post('products/:productId/images/upload-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for image upload' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 201, description: 'Presigned URL generated' })
  @ApiResponse({ status: 400, description: 'Max images reached or invalid file' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async requestImageUploadUrl(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.catalogService.requestImageUploadUrl(productId, dto);
  }

  @Post('products/:productId/images/confirm')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm image upload and create record' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 201, description: 'Image record created' })
  @ApiResponse({ status: 400, description: 'Invalid storage key or max images reached' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async confirmImageUpload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.catalogService.confirmImageUpload(productId, dto);
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
