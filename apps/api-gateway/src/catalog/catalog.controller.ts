import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Public, Language } from '@cyna-api/common';
import { CatalogService } from './catalog.service';
import {
  CategoryQueryDto,
  ProductQueryDto,
  SearchProductDto,
  FeaturedProductsQueryDto,
} from './dto';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==================== Categories ====================

  @Public()
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({
    status: 200,
    description: 'List of categories',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            slug: 'soc-solutions',
            name: 'Solutions SOC',
            description: 'Description...',
            imageUrl: 'https://...',
            isActive: true,
            displayOrder: 0,
            productCount: 5,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 5,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    },
  })
  async getCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.getCategories(query);
  }

  @Public()
  @Get('categories/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiQuery({ name: 'lang', enum: Language, required: false })
  @ApiResponse({
    status: 200,
    description: 'Category details',
    schema: {
      example: {
        id: 'uuid',
        slug: 'soc-solutions',
        name: 'Solutions SOC',
        description: 'Full description...',
        imageUrl: 'https://...',
        isActive: true,
        displayOrder: 0,
        productCount: 5,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryBySlug(
    @Param('slug') slug: string,
    @Query('lang') lang?: Language,
  ) {
    return this.catalogService.getCategoryBySlug(slug, lang);
  }

  // ==================== Products ====================

  @Public()
  @Get('products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({
    status: 200,
    description: 'List of products with pagination',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            slug: 'soc-premium',
            sku: 'SOC-PREM-001',
            name: 'SOC Premium',
            shortDescription: 'Short description...',
            productType: 'saas',
            priceMonthly: 299.99,
            priceYearly: 2999.99,
            isAvailable: true,
            isFeatured: true,
            primaryImage: 'https://...',
            category: { id: 'uuid', slug: 'soc', name: 'SOC' },
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 50,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      },
    },
  })
  async getProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.getProducts(query);
  }

  @Public()
  @Get('products/featured')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get featured products' })
  @ApiResponse({
    status: 200,
    description: 'List of featured products',
    schema: {
      example: [
        {
          id: 'uuid',
          slug: 'soc-premium',
          name: 'SOC Premium',
          shortDescription: 'Short description...',
          productType: 'saas',
          priceMonthly: 299.99,
          primaryImage: 'https://...',
          category: { id: 'uuid', slug: 'soc', name: 'SOC' },
        },
      ],
    },
  })
  async getFeaturedProducts(@Query() query: FeaturedProductsQueryDto) {
    return this.catalogService.getFeaturedProducts(query);
  }

  @Public()
  @Get('products/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search products' })
  @ApiResponse({
    status: 200,
    description: 'Search results with pagination',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            slug: 'soc-premium',
            name: 'SOC Premium',
            shortDescription: 'Short description...',
            productType: 'saas',
            priceMonthly: 299.99,
            primaryImage: 'https://...',
            category: { id: 'uuid', slug: 'soc', name: 'SOC' },
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 10,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    },
  })
  async searchProducts(@Query() query: SearchProductDto) {
    return this.catalogService.searchProducts(query);
  }

  @Public()
  @Get('products/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiQuery({ name: 'lang', enum: Language, required: false })
  @ApiResponse({
    status: 200,
    description: 'Product details',
    schema: {
      example: {
        id: 'uuid',
        slug: 'soc-premium',
        sku: 'SOC-PREM-001',
        name: 'SOC Premium',
        description: 'Full description...',
        shortDescription: 'Short description...',
        productType: 'saas',
        priceMonthly: 299.99,
        priceYearly: 2999.99,
        isAvailable: true,
        isFeatured: true,
        images: [{ id: 'uuid', url: 'https://...', isPrimary: true }],
        characteristics: [{ key: 'users', value: '10' }],
        category: { id: 'uuid', slug: 'soc', name: 'SOC' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductBySlug(
    @Param('slug') slug: string,
    @Query('lang') lang?: Language,
  ) {
    return this.catalogService.getProductBySlug(slug, lang);
  }
}
