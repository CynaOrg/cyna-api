import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import {
  CreateContactMessageDto,
  CreateSlideDto,
  UpdateSlideDto,
  UpdateHeroTextDto,
  ContactMessageQueryDto,
  UpdateContactMessageDto,
} from './dto';

@Injectable()
export class ContentService {
  private readonly TIMEOUT = 10000;

  constructor(
    @Inject(SERVICE_NAMES.CONTENT)
    private readonly contentClient: ClientProxy,
  ) {}

  // ==================== Public ====================

  async getHomepage(lang?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.GET_HOMEPAGE, { lang });
  }

  async getCarousel(lang?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.GET_CAROUSEL, { lang });
  }

  async getTopServices(limit?: number, lang?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.GET_TOP_SERVICES, { limit, lang });
  }

  async getTopProducts(limit?: number, lang?: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.GET_TOP_PRODUCTS, { limit, lang });
  }

  async createContactMessage(dto: CreateContactMessageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.CREATE_CONTACT_MESSAGE, dto);
  }

  // ==================== Admin - Carousel ====================

  async adminGetCarousel() {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CAROUSEL, {});
  }

  async adminCreateSlide(dto: CreateSlideDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_CREATE_SLIDE, dto);
  }

  async adminUpdateSlide(slideId: string, dto: UpdateSlideDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_SLIDE, { id: slideId, dto });
  }

  async adminDeleteSlide(slideId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_SLIDE, { id: slideId });
  }

  async adminReorderCarousel(slideIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_REORDER_CAROUSEL, { slideIds });
  }

  // ==================== Admin - Hero & Top Products ====================

  async adminUpdateHeroText(dto: UpdateHeroTextDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_HERO_TEXT, dto);
  }

  async adminUpdateTopServices(productIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_SERVICES, { productIds });
  }

  async adminUpdateTopProducts(productIds: string[]) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_PRODUCTS, { productIds });
  }

  // ==================== Admin - Contact Messages ====================

  async adminGetContactMessages(query: ContactMessageQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CONTACT_MESSAGES, query);
  }

  async adminUpdateContactMessage(messageId: string, dto: UpdateContactMessageDto) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_CONTACT_MESSAGE, {
      id: messageId,
      dto,
    });
  }

  async adminDeleteContactMessage(messageId: string) {
    return this.sendMessage(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_CONTACT_MESSAGE, {
      id: messageId,
    });
  }

  // ==================== Private Helper ====================

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.contentClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Content service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
