import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_TTL,
  CACHE_KEYS,
  CACHE_PREFIXES,
} from '@cyna-api/common';
import { CarouselSlide } from '../entities';
import { CreateCarouselSlideDto, UpdateCarouselSlideDto } from '../dto';

@Injectable()
export class CarouselService {
  constructor(
    @InjectRepository(CarouselSlide)
    private readonly carouselRepository: Repository<CarouselSlide>,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
  ) {}

  async findAllPublic(): Promise<CarouselSlide[]> {
    return this.cacheService.getOrSet(
      CACHE_KEYS.CAROUSEL_ITEMS,
      async () => {
        return this.carouselRepository.find({
          where: { isActive: true },
          order: { displayOrder: 'ASC' },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findAllAdmin(): Promise<CarouselSlide[]> {
    return this.carouselRepository.find({
      order: { displayOrder: 'ASC' },
    });
  }

  async create(dto: CreateCarouselSlideDto): Promise<CarouselSlide> {
    const slide = this.carouselRepository.create({
      titleFr: dto.titleFr,
      titleEn: dto.titleEn,
      subtitleFr: dto.subtitleFr,
      subtitleEn: dto.subtitleEn,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      linkTextFr: dto.linkTextFr,
      linkTextEn: dto.linkTextEn,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await this.carouselRepository.save(slide);
    this.logger.log(`Carousel slide created: ${slide.id}`);

    await this.invalidateCarouselCache();

    return slide;
  }

  async update(id: string, dto: UpdateCarouselSlideDto): Promise<CarouselSlide> {
    const slide = await this.carouselRepository.findOne({ where: { id } });

    if (!slide) {
      this.logger.warn(`Carousel slide not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.content.carouselSlideNotFound',
        code: 'CAROUSEL_SLIDE_NOT_FOUND',
      });
    }

    Object.assign(slide, dto);
    await this.carouselRepository.save(slide);

    this.logger.log(`Carousel slide updated: ${slide.id}`);

    await this.invalidateCarouselCache();

    return slide;
  }

  async delete(id: string): Promise<void> {
    const slide = await this.carouselRepository.findOne({ where: { id } });

    if (!slide) {
      this.logger.warn(`Carousel slide not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.content.carouselSlideNotFound',
        code: 'CAROUSEL_SLIDE_NOT_FOUND',
      });
    }

    await this.carouselRepository.remove(slide);
    this.logger.log(`Carousel slide deleted: ${id}`);

    await this.invalidateCarouselCache();
  }

  async reorder(slideIds: string[]): Promise<CarouselSlide[]> {
    const slides = await this.carouselRepository.find({
      where: { id: In(slideIds) },
    });

    if (slides.length !== slideIds.length) {
      this.logger.warn(`Some carousel slide IDs not found during reorder`);
      throw new RpcException({
        statusCode: 400,
        message: 'errors.content.carouselInvalidSlideIds',
        code: 'CAROUSEL_INVALID_SLIDE_IDS',
      });
    }

    for (let i = 0; i < slideIds.length; i++) {
      const slide = slides.find((s) => s.id === slideIds[i]);
      if (slide) {
        slide.displayOrder = i;
      }
    }

    await this.carouselRepository.save(slides);
    this.logger.log(`Carousel slides reordered: ${slideIds.length} slides`);

    await this.invalidateCarouselCache();

    return this.carouselRepository.find({
      order: { displayOrder: 'ASC' },
    });
  }

  private async invalidateCarouselCache(): Promise<void> {
    await this.cacheService.del(CACHE_KEYS.CAROUSEL_ITEMS);
    await this.cacheService.del(CACHE_KEYS.HOMEPAGE);
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.CONTENT}carousel*`);
  }
}
