import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CynaLoggerService } from '@cyna-api/common';
import { CarouselSlide, HeroText } from '../entities';

@Injectable()
export class ContentDataSeeder implements OnModuleInit {
  constructor(
    @InjectRepository(CarouselSlide)
    private readonly carouselRepository: Repository<CarouselSlide>,
    @InjectRepository(HeroText)
    private readonly heroTextRepository: Repository<HeroText>,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const shouldSeed = this.configService.get<boolean>('content.seed.enabled', false);
    if (!shouldSeed) {
      this.logger.debug('Content seeding disabled, skipping initial data');
      return;
    }

    await this.seed();
  }

  async seed(): Promise<void> {
    this.logger.log('Starting content initial data seeding...');

    const heroTextCreated = await this.seedHeroText();
    const slidesCreated = await this.seedCarouselSlides();

    this.logger.log(
      `Content seeding completed: ${heroTextCreated ? 1 : 0} hero text, ${slidesCreated} carousel slides`,
    );
  }

  private async seedHeroText(): Promise<boolean> {
    const existing = await this.heroTextRepository.findOne({ where: {} });

    if (existing) {
      this.logger.debug('Hero text already exists, skipping');
      return false;
    }

    const heroText = this.heroTextRepository.create({
      titleFr: 'Protegez votre entreprise avec CYNA',
      titleEn: 'Protect your business with CYNA',
      subtitleFr:
        'Solutions de cybersecurite de nouvelle generation pour les entreprises exigeantes',
      subtitleEn: 'Next-generation cybersecurity solutions for demanding businesses',
    });

    await this.heroTextRepository.save(heroText);
    this.logger.log('Created default hero text');
    return true;
  }

  private async seedCarouselSlides(): Promise<number> {
    const existingCount = await this.carouselRepository.count();

    if (existingCount > 0) {
      this.logger.debug('Carousel slides already exist, skipping');
      return 0;
    }

    const slides = [
      {
        titleFr: 'SOC Premium - Surveillance 24/7',
        titleEn: 'SOC Premium - 24/7 Monitoring',
        subtitleFr: 'Protection continue de votre infrastructure',
        subtitleEn: 'Continuous protection for your infrastructure',
        imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80',
        linkUrl: '/products/soc-premium',
        linkTextFr: 'Decouvrir',
        linkTextEn: 'Discover',
        displayOrder: 0,
        isActive: true,
      },
      {
        titleFr: 'EDR Advanced - Protection des endpoints',
        titleEn: 'EDR Advanced - Endpoint Protection',
        subtitleFr: 'Detection et reponse avancees avec IA',
        subtitleEn: 'Advanced detection and response with AI',
        imageUrl: 'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&q=80',
        linkUrl: '/products/edr-advanced',
        linkTextFr: 'En savoir plus',
        linkTextEn: 'Learn more',
        displayOrder: 1,
        isActive: true,
      },
    ];

    let created = 0;

    for (const slideData of slides) {
      const slide = this.carouselRepository.create(slideData);
      await this.carouselRepository.save(slide);
      this.logger.log(`Created carousel slide: ${slideData.titleFr}`);
      created++;
    }

    return created;
  }
}
