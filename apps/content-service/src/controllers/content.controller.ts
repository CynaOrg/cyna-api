import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
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
  async getHomepage(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const [carousel, heroText, topServicesData, topProductsData] = await Promise.all([
        this.carouselService.findAllPublic(),
        this.heroTextService.get(),
        this.topProductsService.getTopServicesWithDetails(),
        this.topProductsService.getTopProductsWithDetails(),
      ]);

      const result = {
        carousel,
        heroText,
        topServices: topServicesData.products,
        topProducts: topProductsData.products,
      };

      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Carousel (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_CAROUSEL)
  async getCarousel(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.carouselService.findAllPublic();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Top Services/Products (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_TOP_SERVICES)
  async getTopServices(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.topProductsService.getTopServicesWithDetails();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.GET_TOP_PRODUCTS)
  async getTopProducts(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.topProductsService.getTopProductsWithDetails();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Contact Messages (Public) ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.CREATE_CONTACT_MESSAGE)
  async createContactMessage(@Payload() data: CreateContactMessageDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const message = await this.contactMessageService.create(data);

      // Emit event to notification service
      this.eventsPublisher.emitContactMessageReceived({
        messageId: message.id,
        name: message.name,
        email: message.email,
        subject: message.subject,
      });

      channel.ack(originalMsg);
      return message;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Admin - Carousel ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CAROUSEL)
  async adminGetCarousel(@Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.carouselService.findAllAdmin();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_CREATE_SLIDE)
  async adminCreateSlide(@Payload() data: CreateCarouselSlideDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.carouselService.create(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_SLIDE)
  async adminUpdateSlide(
    @Payload() data: { id: string; dto: UpdateCarouselSlideDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.carouselService.update(data.id, data.dto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_SLIDE)
  async adminDeleteSlide(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.carouselService.delete(data.id);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_REORDER_CAROUSEL)
  async adminReorderCarousel(@Payload() data: ReorderCarouselDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.carouselService.reorder(data.slideIds);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Admin - Hero Text ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_HERO_TEXT)
  async adminUpdateHeroText(@Payload() data: UpdateHeroTextDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.heroTextService.update(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Admin - Top Services/Products ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_SERVICES)
  async adminUpdateTopServices(@Payload() data: UpdateTopProductsDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.topProductsService.updateTopServices(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_PRODUCTS)
  async adminUpdateTopProducts(@Payload() data: UpdateTopProductsDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.topProductsService.updateTopProducts(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Admin - Contact Messages ====================

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CONTACT_MESSAGES)
  async adminGetContactMessages(
    @Payload() data: ContactMessageQueryDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.contactMessageService.findAll(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_CONTACT_MESSAGE)
  async adminUpdateContactMessage(
    @Payload() data: { id: string; dto: UpdateContactMessageDto },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.contactMessageService.update(data.id, data.dto);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_CONTACT_MESSAGE)
  async adminDeleteContactMessage(@Payload() data: { id: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.contactMessageService.delete(data.id);
      channel.ack(originalMsg);
      return { success: true };
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
