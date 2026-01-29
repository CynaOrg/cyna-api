import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Public, Language } from '@cyna-api/common';
import { CatalogService } from './catalog.service';
import { CategoryQueryDto, ProductQueryDto } from './dto';

@ApiTags('Catalog')
@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==================== Categories ====================

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async findAllCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.findAllCategories(query);
  }

  @Get('categories/:slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiQuery({ name: 'lang', enum: Language, required: false })
  @ApiResponse({ status: 200, description: 'Category details' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategoryBySlug(@Param('slug') slug: string, @Query('lang') lang?: Language) {
    return this.catalogService.findCategoryBySlug(slug, lang);
  }

  // ==================== Products ====================

  @Get('products')
  @ApiOperation({ summary: 'Get all products with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findAllProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.findAllProducts(query);
  }

  @Get('products/featured')
  @ApiOperation({ summary: 'Get featured products' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of products to return' })
  @ApiQuery({ name: 'lang', enum: Language, required: false })
  @ApiResponse({ status: 200, description: 'List of featured products' })
  async findFeaturedProducts(@Query('limit') limit?: number, @Query('lang') lang?: Language) {
    return this.catalogService.findFeaturedProducts(limit, lang);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiQuery({ name: 'lang', enum: Language, required: false })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findProductBySlug(@Param('slug') slug: string, @Query('lang') lang?: Language) {
    return this.catalogService.findProductBySlug(slug, lang);
  }

  @Get('products/:slug/stock')
  @ApiOperation({ summary: 'Get product stock information' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiResponse({ status: 200, description: 'Stock information' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductStock(@Param('slug') slug: string) {
    const product = await this.catalogService.findProductBySlug(slug);
    return this.catalogService.getStockInfo(product.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchProducts(@Query('q') searchTerm: string, @Query() query: ProductQueryDto) {
    return this.catalogService.searchProducts(searchTerm || '', query);
  }
}
