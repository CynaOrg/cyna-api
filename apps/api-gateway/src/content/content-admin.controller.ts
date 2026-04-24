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
import { ContentService } from './content.service';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';
import {
  CreateSlideDto,
  UpdateSlideDto,
  ReorderCarouselDto,
  UpdateHeroTextDto,
  UpdateTopConfigDto,
  ContactMessageQueryDto,
  UpdateContactMessageDto,
  RequestContentUploadUrlDto,
} from './dto';

@ApiTags('Admin - Content')
@Controller('admin/content')
@UseGuards(JwtAdminAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ContentAdminController {
  constructor(private readonly contentService: ContentService) {}

  // ==================== Carousel ====================

  @Get('carousel')
  @ApiOperation({ summary: 'Get all carousel slides (admin, includes inactive)' })
  @ApiResponse({ status: 200, description: 'All carousel slides' })
  async getCarousel() {
    return this.contentService.adminGetCarousel();
  }

  @Post('carousel')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new carousel slide' })
  @ApiResponse({ status: 201, description: 'Slide created' })
  async createSlide(@Body() dto: CreateSlideDto) {
    return this.contentService.adminCreateSlide(dto);
  }

  // IMPORTANT: Static routes must come before parameterized routes
  @Patch('carousel/reorder')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Reorder carousel slides' })
  @ApiResponse({ status: 200, description: 'Slides reordered' })
  async reorderCarousel(@Body() dto: ReorderCarouselDto) {
    return this.contentService.adminReorderCarousel(dto.slideIds);
  }

  @Post('carousel/upload-url')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Get a presigned URL to upload a carousel image' })
  @ApiResponse({ status: 201, description: 'Presigned URL generated' })
  @ApiResponse({ status: 400, description: 'Invalid file parameters' })
  async requestCarouselUploadUrl(@Body() dto: RequestContentUploadUrlDto) {
    return this.contentService.adminRequestCarouselUploadUrl(dto);
  }

  @Patch('carousel/:slideId')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update a carousel slide' })
  @ApiParam({ name: 'slideId', description: 'Slide ID' })
  @ApiResponse({ status: 200, description: 'Slide updated' })
  @ApiResponse({ status: 404, description: 'Slide not found' })
  async updateSlide(@Param('slideId') slideId: string, @Body() dto: UpdateSlideDto) {
    return this.contentService.adminUpdateSlide(slideId, dto);
  }

  @Delete('carousel/:slideId')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Delete a carousel slide' })
  @ApiParam({ name: 'slideId', description: 'Slide ID' })
  @ApiResponse({ status: 200, description: 'Slide deleted' })
  @ApiResponse({ status: 404, description: 'Slide not found' })
  async deleteSlide(@Param('slideId') slideId: string) {
    return this.contentService.adminDeleteSlide(slideId);
  }

  // ==================== Hero & Top Products ====================

  @Patch('hero-text')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update hero section text' })
  @ApiResponse({ status: 200, description: 'Hero text updated' })
  async updateHeroText(@Body() dto: UpdateHeroTextDto) {
    return this.contentService.adminUpdateHeroText(dto);
  }

  @Patch('top-services')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Configure top services (SaaS products displayed on homepage)' })
  @ApiResponse({ status: 200, description: 'Top services updated' })
  async updateTopServices(@Body() dto: UpdateTopConfigDto) {
    return this.contentService.adminUpdateTopServices(dto.productIds);
  }

  @Patch('top-products')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Configure top products displayed on homepage' })
  @ApiResponse({ status: 200, description: 'Top products updated' })
  async updateTopProducts(@Body() dto: UpdateTopConfigDto) {
    return this.contentService.adminUpdateTopProducts(dto.productIds);
  }

  // ==================== Contact Messages ====================

  @Get('contact-messages')
  @ApiOperation({ summary: 'Get contact messages (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated contact messages' })
  async getContactMessages(@Query() query: ContactMessageQueryDto) {
    return this.contentService.adminGetContactMessages(query);
  }

  @Patch('contact-messages/:messageId')
  @ApiOperation({ summary: 'Update contact message status' })
  @ApiParam({ name: 'messageId', description: 'Contact message ID' })
  @ApiResponse({ status: 200, description: 'Message updated' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async updateContactMessage(
    @Param('messageId') messageId: string,
    @Body() dto: UpdateContactMessageDto,
  ) {
    return this.contentService.adminUpdateContactMessage(messageId, dto);
  }

  @Delete('contact-messages/:messageId')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Delete a contact message' })
  @ApiParam({ name: 'messageId', description: 'Contact message ID' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteContactMessage(@Param('messageId') messageId: string) {
    return this.contentService.adminDeleteContactMessage(messageId);
  }
}
