import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { TimeoutError } from 'rxjs';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_TTL,
  CACHE_KEYS,
  CACHE_PREFIXES,
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  Language,
  coerceLanguage,
  FeaturedProductType,
} from '@cyna-api/common';
import { TopProductConfig } from '../entities';
import { UpdateTopProductsDto, ToggleFeaturedDto } from '../dto';
import { ContentEventsPublisher } from '../events';

interface RawProductImage {
  imageUrl: string;
  isPrimary: boolean;
  displayOrder: number;
}

interface RawProductCategory {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
}

interface RawProductEntity {
  id: string;
  slug: string;
  sku?: string;
  nameFr: string;
  nameEn: string;
  shortDescriptionFr?: string;
  shortDescriptionEn?: string;
  productType: string;
  priceMonthly?: string | number;
  priceYearly?: string | number;
  priceUnit?: string | number;
  isAvailable: boolean;
  isFeatured: boolean;
  images?: RawProductImage[];
  categoryId?: string;
  category?: RawProductCategory;
}

export interface LocalizedTopProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  productType: string;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  isAvailable: boolean;
  isFeatured: boolean;
  primaryImageUrl?: string;
  categoryId?: string;
  categoryName?: string;
}

const CONFIG_TYPE_SERVICES = 'top_services';
const CONFIG_TYPE_PRODUCTS = 'top_products';
const FEATURED_LIMIT = 8;

@Injectable()
export class TopProductsService {
  constructor(
    @InjectRepository(TopProductConfig)
    private readonly topProductConfigRepository: Repository<TopProductConfig>,
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
    private readonly eventsPublisher: ContentEventsPublisher,
  ) {}

  async getFullSyncSnapshot(): Promise<{ saasIds: string[]; physicalIds: string[] }> {
    const [services, products] = await Promise.all([
      this.topProductConfigRepository.findOne({ where: { configType: CONFIG_TYPE_SERVICES } }),
      this.topProductConfigRepository.findOne({ where: { configType: CONFIG_TYPE_PRODUCTS } }),
    ]);
    return {
      saasIds: services?.productIds ?? [],
      physicalIds: products?.productIds ?? [],
    };
  }

  async getTopServices(): Promise<TopProductConfig> {
    return this.cacheService.getOrSet(
      CACHE_KEYS.TOP_SERVICES,
      async () => {
        const config = await this.topProductConfigRepository.findOne({
          where: { configType: CONFIG_TYPE_SERVICES },
        });

        if (!config) {
          return this.topProductConfigRepository.create({
            configType: CONFIG_TYPE_SERVICES,
            productIds: [],
          });
        }

        return config;
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async getTopProducts(): Promise<TopProductConfig> {
    return this.cacheService.getOrSet(
      CACHE_KEYS.TOP_PRODUCTS,
      async () => {
        const config = await this.topProductConfigRepository.findOne({
          where: { configType: CONFIG_TYPE_PRODUCTS },
        });

        if (!config) {
          return this.topProductConfigRepository.create({
            configType: CONFIG_TYPE_PRODUCTS,
            productIds: [],
          });
        }

        return config;
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async getTopServicesWithDetails(lang?: string): Promise<{
    config: TopProductConfig;
    products: LocalizedTopProduct[];
  }> {
    const config = await this.getTopServices();
    const products = await this.resolveProductDetails(config.productIds, coerceLanguage(lang));
    return { config, products };
  }

  async getTopProductsWithDetails(lang?: string): Promise<{
    config: TopProductConfig;
    products: LocalizedTopProduct[];
  }> {
    const config = await this.getTopProducts();
    const products = await this.resolveProductDetails(config.productIds, coerceLanguage(lang));
    return { config, products };
  }

  async updateTopServices(dto: UpdateTopProductsDto): Promise<TopProductConfig> {
    return this.persistConfig(CONFIG_TYPE_SERVICES, 'saas', dto.productIds);
  }

  async updateTopProducts(dto: UpdateTopProductsDto): Promise<TopProductConfig> {
    return this.persistConfig(CONFIG_TYPE_PRODUCTS, 'physical', dto.productIds);
  }

  async toggleFeatured(dto: ToggleFeaturedDto): Promise<TopProductConfig> {
    const configType = dto.productType === 'saas' ? CONFIG_TYPE_SERVICES : CONFIG_TYPE_PRODUCTS;

    let config = await this.topProductConfigRepository.findOne({
      where: { configType },
    });

    const previousIds = config?.productIds ?? [];
    const exists = previousIds.includes(dto.productId);

    if (dto.featured && exists) {
      return config!;
    }
    if (!dto.featured && !exists) {
      return config ?? this.topProductConfigRepository.create({ configType, productIds: [] });
    }

    let nextIds: string[];
    if (dto.featured) {
      if (previousIds.length >= FEATURED_LIMIT) {
        throw new RpcException({
          statusCode: 400,
          message: `Featured products limit reached (${FEATURED_LIMIT})`,
          code: 'FEATURED_LIMIT_REACHED',
        });
      }
      nextIds = [...previousIds, dto.productId];
    } else {
      nextIds = previousIds.filter((id) => id !== dto.productId);
    }

    if (!config) {
      config = this.topProductConfigRepository.create({ configType, productIds: nextIds });
    } else {
      config.productIds = nextIds;
    }
    await this.topProductConfigRepository.save(config);
    this.logger.log(
      `Featured toggle (${dto.productType}) ${dto.featured ? 'add' : 'remove'} ${dto.productId} (now ${nextIds.length})`,
    );

    await this.invalidateTopProductsCache();

    this.eventsPublisher.emitTopProductsUpdated({
      productType: dto.productType,
      added: dto.featured ? [dto.productId] : [],
      removed: dto.featured ? [] : [dto.productId],
    });

    return config;
  }

  private async persistConfig(
    configType: typeof CONFIG_TYPE_SERVICES | typeof CONFIG_TYPE_PRODUCTS,
    productType: FeaturedProductType,
    nextIds: string[],
  ): Promise<TopProductConfig> {
    let config = await this.topProductConfigRepository.findOne({
      where: { configType },
    });

    const previousIds = config?.productIds ?? [];

    if (!config) {
      config = this.topProductConfigRepository.create({ configType, productIds: nextIds });
    } else {
      config.productIds = nextIds;
    }
    await this.topProductConfigRepository.save(config);
    this.logger.log(`${configType} updated: ${nextIds.length} products`);

    await this.invalidateTopProductsCache();

    const added = nextIds.filter((id) => !previousIds.includes(id));
    const removed = previousIds.filter((id) => !nextIds.includes(id));
    this.eventsPublisher.emitTopProductsUpdated({ productType, added, removed });

    return config;
  }

  private async resolveProductDetails(
    productIds: string[],
    lang: Language = Language.FR,
  ): Promise<LocalizedTopProduct[]> {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    const products: LocalizedTopProduct[] = [];

    for (const productId of productIds) {
      try {
        const product = await firstValueFrom(
          this.catalogClient
            .send<RawProductEntity>(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: productId })
            .pipe(
              timeout(5000),
              retry({ count: 1, delay: 1000 }),
              catchError((err) => {
                if (err instanceof TimeoutError) {
                  this.logger.warn(`Timeout resolving product details for: ${productId}`);
                }
                throw err;
              }),
            ),
        );
        products.push(this.toLocalizedProduct(product, lang));
      } catch (error) {
        this.logger.warn(
          `Failed to resolve product details for: ${productId} - ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return products;
  }

  private toLocalizedProduct(product: RawProductEntity, lang: Language): LocalizedTopProduct {
    const isEn = lang === Language.EN;
    const primaryImage = product.images?.find((img) => img.isPrimary) ?? product.images?.[0];

    return {
      id: product.id,
      slug: product.slug,
      name: isEn ? product.nameEn : product.nameFr,
      shortDescription: isEn ? product.shortDescriptionEn : product.shortDescriptionFr,
      productType: product.productType,
      priceMonthly: product.priceMonthly != null ? Number(product.priceMonthly) : undefined,
      priceYearly: product.priceYearly != null ? Number(product.priceYearly) : undefined,
      priceUnit: product.priceUnit != null ? Number(product.priceUnit) : undefined,
      isAvailable: product.isAvailable,
      isFeatured: product.isFeatured,
      primaryImageUrl: primaryImage?.imageUrl,
      categoryId: product.categoryId,
      categoryName: product.category
        ? isEn
          ? product.category.nameEn
          : product.category.nameFr
        : undefined,
    };
  }

  private async invalidateTopProductsCache(): Promise<void> {
    await this.cacheService.del(CACHE_KEYS.TOP_SERVICES);
    await this.cacheService.del(CACHE_KEYS.TOP_PRODUCTS);
    await this.cacheService.del(CACHE_KEYS.HOMEPAGE);
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.CONTENT}top*`);
  }
}
