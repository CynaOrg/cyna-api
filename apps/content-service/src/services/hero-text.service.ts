import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_TTL,
  CACHE_KEYS,
  CACHE_PREFIXES,
} from '@cyna-api/common';
import { HeroText } from '../entities';
import { UpdateHeroTextDto } from '../dto';

const DEFAULT_HERO_TEXT = {
  titleFr: 'Bienvenue chez CYNA',
  titleEn: 'Welcome to CYNA',
  subtitleFr: 'Solutions de cybersecurite pour votre entreprise',
  subtitleEn: 'Cybersecurity solutions for your business',
};

const CACHE_KEY_HERO_TEXT = `${CACHE_PREFIXES.CONTENT}hero-text`;

@Injectable()
export class HeroTextService {
  constructor(
    @InjectRepository(HeroText)
    private readonly heroTextRepository: Repository<HeroText>,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
  ) {}

  async get(): Promise<HeroText> {
    return this.cacheService.getOrSet(
      CACHE_KEY_HERO_TEXT,
      async () => {
        const heroText = await this.heroTextRepository.findOne({
          where: {},
          order: { createdAt: 'ASC' },
        });

        if (!heroText) {
          this.logger.debug('No hero text found, returning default');
          const defaultHero = this.heroTextRepository.create(DEFAULT_HERO_TEXT);
          return defaultHero;
        }

        return heroText;
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async update(dto: UpdateHeroTextDto): Promise<HeroText> {
    let heroText = await this.heroTextRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!heroText) {
      // Create new hero text if none exists, falling back to defaults for missing fields.
      heroText = this.heroTextRepository.create({
        titleFr: dto.titleFr ?? DEFAULT_HERO_TEXT.titleFr,
        titleEn: dto.titleEn ?? DEFAULT_HERO_TEXT.titleEn,
        subtitleFr: dto.subtitleFr ?? DEFAULT_HERO_TEXT.subtitleFr,
        subtitleEn: dto.subtitleEn ?? DEFAULT_HERO_TEXT.subtitleEn,
      });
    } else {
      // Partial update: only overwrite fields explicitly provided. Skip
      // undefined keys so the existing record values are preserved.
      if (dto.titleFr !== undefined) heroText.titleFr = dto.titleFr;
      if (dto.titleEn !== undefined) heroText.titleEn = dto.titleEn;
      if (dto.subtitleFr !== undefined) heroText.subtitleFr = dto.subtitleFr;
      if (dto.subtitleEn !== undefined) heroText.subtitleEn = dto.subtitleEn;
    }

    await this.heroTextRepository.save(heroText);
    this.logger.log(`Hero text updated: ${heroText.id}`);

    await this.invalidateHeroTextCache();

    return heroText;
  }

  private async invalidateHeroTextCache(): Promise<void> {
    await this.cacheService.del(CACHE_KEY_HERO_TEXT);
    await this.cacheService.del(CACHE_KEYS.HOMEPAGE);
  }
}
