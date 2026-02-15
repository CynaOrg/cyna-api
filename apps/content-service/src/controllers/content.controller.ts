import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import {
  CarouselService,
  HeroTextService,
  TopProductsService,
  ContactMessageService,
} from '../services';
import {
  CreateCarouselSlideDto,
  UpdateCarouselSlideDto,
  ReorderCarouselDto,
  UpdateHeroTextDto,
  UpdateTopProductsDto,
  CreateContactMessageDto,
  ContactMessageQueryDto,
  UpdateContactMessageDto,
} from '../dto';
import { ContentEventsPublisher } from '../events';

@Controller()
export class ContentController {
  constructor(
    private readonly carouselService: CarouselService,
    private readonly heroTextService: HeroTextService,
    private readonly topProductsService: TopProductsService,
    private readonly contactMessageService: ContactMessageService,
    private readonly eventsPublisher: ContentEventsPublisher,
  ) {}

  // ==================== Homepage ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_HOMEPAGE)
  async getHomepage() {
    const [carousel, heroText, topServicesData, topProductsData] = await Promise.all([
      this.carouselService.findAllPublic(),
      this.heroTextService.get(),
      this.topProductsService.getTopServicesWithDetails(),
      this.topProductsService.getTopProductsWithDetails(),
    ]);

    return {
      carousel,
      heroText,
      topServices: topServicesData.products,
      topProducts: topProductsData.products,
    };
  }

  // ==================== Carousel (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_CAROUSEL)
  async getCarousel() {
    return this.carouselService.findAllPublic();
  }

  // ==================== Top Services/Products (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_TOP_SERVICES)
  async getTopServices() {
    return this.topProductsService.getTopServicesWithDetails();
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_TOP_PRODUCTS)
  async getTopProducts() {
    return this.topProductsService.getTopProductsWithDetails();
  }

  // ==================== Contact Messages (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.CREATE_CONTACT_MESSAGE)
  async createContactMessage(@Payload() data: CreateContactMessageDto) {
    const message = await this.contactMessageService.create(data);

    // Emit event to notification service
    this.eventsPublisher.emitContactMessageReceived({
      messageId: message.id,
      name: message.name,
      email: message.email,
      subject: message.subject,
    });

    return message;
  }

  // ==================== Admin - Carousel ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CAROUSEL)
  async adminGetCarousel() {
    return this.carouselService.findAllAdmin();
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_CREATE_SLIDE)
  async adminCreateSlide(@Payload() data: CreateCarouselSlideDto) {
    return this.carouselService.create(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_SLIDE)
  async adminUpdateSlide(@Payload() data: { id: string; dto: UpdateCarouselSlideDto }) {
    return this.carouselService.update(data.id, data.dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_SLIDE)
  async adminDeleteSlide(@Payload() data: { id: string }) {
    await this.carouselService.delete(data.id);
    return { success: true };
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_REORDER_CAROUSEL)
  async adminReorderCarousel(@Payload() data: ReorderCarouselDto) {
    return this.carouselService.reorder(data.slideIds);
  }

  // ==================== Admin - Hero Text ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_HERO_TEXT)
  async adminUpdateHeroText(@Payload() data: UpdateHeroTextDto) {
    return this.heroTextService.update(data);
  }

  // ==================== Admin - Top Services/Products ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_SERVICES)
  async adminUpdateTopServices(@Payload() data: UpdateTopProductsDto) {
    return this.topProductsService.updateTopServices(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_PRODUCTS)
  async adminUpdateTopProducts(@Payload() data: UpdateTopProductsDto) {
    return this.topProductsService.updateTopProducts(data);
  }

  // ==================== Admin - Contact Messages ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CONTACT_MESSAGES)
  async adminGetContactMessages(@Payload() data: ContactMessageQueryDto) {
    return this.contactMessageService.findAll(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_CONTACT_MESSAGE)
  async adminUpdateContactMessage(@Payload() data: { id: string; dto: UpdateContactMessageDto }) {
    return this.contactMessageService.update(data.id, data.dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_CONTACT_MESSAGE)
  async adminDeleteContactMessage(@Payload() data: { id: string }) {
    await this.contactMessageService.delete(data.id);
    return { success: true };
  }
}
