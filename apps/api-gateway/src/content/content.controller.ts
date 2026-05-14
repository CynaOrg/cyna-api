import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from '@cyna-api/common';
import { ContentService } from './content.service';
import { CreateContactMessageDto } from './dto';

@ApiTags('Content')
@Controller('content')
@Public()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('homepage')
  @ApiOperation({ summary: 'Get homepage content (carousel + hero + top products)' })
  @ApiResponse({ status: 200, description: 'Homepage content' })
  @ApiQuery({ name: 'lang', required: false, enum: ['fr', 'en'] })
  async getHomepage(@Query('lang') lang?: string) {
    return this.contentService.getHomepage(lang);
  }

  @Get('carousel')
  @ApiOperation({ summary: 'Get active carousel slides' })
  @ApiResponse({ status: 200, description: 'Active carousel slides' })
  @ApiQuery({ name: 'lang', required: false, enum: ['fr', 'en'] })
  async getCarousel(@Query('lang') lang?: string) {
    return this.contentService.getCarousel(lang);
  }

  @Get('top-services')
  @ApiOperation({ summary: 'Get top services (SaaS products)' })
  @ApiResponse({ status: 200, description: 'Top services list' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'lang', required: false, enum: ['fr', 'en'] })
  async getTopServices(@Query('limit') limit?: number, @Query('lang') lang?: string) {
    return this.contentService.getTopServices(limit, lang);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top products' })
  @ApiResponse({ status: 200, description: 'Top products list' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'lang', required: false, enum: ['fr', 'en'] })
  async getTopProducts(@Query('limit') limit?: number, @Query('lang') lang?: string) {
    return this.contentService.getTopProducts(limit, lang);
  }

  @Post('contact')
  @ApiOperation({ summary: 'Submit a contact message' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createContactMessage(@Body() dto: CreateContactMessageDto) {
    return this.contentService.createContactMessage(dto);
  }
}
