import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
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
} from '@cyna-api/common';
import { RpcException } from '@nestjs/microservices';
import { TopProductConfig } from '../entities';
import { UpdateTopProductsDto } from '../dto';

const CONFIG_TYPE_SERVICES = 'top_services';
const CONFIG_TYPE_PRODUCTS = 'top_products';

@Injectable()
export class TopProductsService {
  constructor(
    @InjectRepository(TopProductConfig)
    private readonly topProductConfigRepository: Repository<TopProductConfig>,
    @Inject(SERVICE_NAMES.CATALOG)
    private readonly catalogClient: ClientProxy,
    private readonly logger: CynaLoggerService,
    private readonly cacheService: CynaCacheService,
  ) {}

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

  async getTopServicesWithDetails(): Promise<{ config: TopProductConfig; products: any[] }> {
    const config = await this.getTopServices();
    const products = await this.resolveProductDetails(config.productIds);
    return { config, products };
  }

  async getTopProductsWithDetails(): Promise<{ config: TopProductConfig; products: any[] }> {
    const config = await this.getTopProducts();
    const products = await this.resolveProductDetails(config.productIds);
    return { config, products };
  }

  async updateTopServices(dto: UpdateTopProductsDto): Promise<TopProductConfig> {
    let config = await this.topProductConfigRepository.findOne({
      where: { configType: CONFIG_TYPE_SERVICES },
    });

    if (!config) {
      config = this.topProductConfigRepository.create({
        configType: CONFIG_TYPE_SERVICES,
        productIds: dto.productIds,
      });
    } else {
      config.productIds = dto.productIds;
    }

    await this.topProductConfigRepository.save(config);
    this.logger.log(`Top services updated: ${dto.productIds.length} products`);

    await this.invalidateTopProductsCache();

    return config;
  }

  async updateTopProducts(dto: UpdateTopProductsDto): Promise<TopProductConfig> {
    let config = await this.topProductConfigRepository.findOne({
      where: { configType: CONFIG_TYPE_PRODUCTS },
    });

    if (!config) {
      config = this.topProductConfigRepository.create({
        configType: CONFIG_TYPE_PRODUCTS,
        productIds: dto.productIds,
      });
    } else {
      config.productIds = dto.productIds;
    }

    await this.topProductConfigRepository.save(config);
    this.logger.log(`Top products updated: ${dto.productIds.length} products`);

    await this.invalidateTopProductsCache();

    return config;
  }

  private async resolveProductDetails(productIds: string[]): Promise<any[]> {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    const products: any[] = [];

    for (const productId of productIds) {
      try {
        const product = await firstValueFrom(
          this.catalogClient
            .send(MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_BY_ID, { id: productId })
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
        products.push(product);
      } catch (error) {
        this.logger.warn(
          `Failed to resolve product details for: ${productId} - ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return products;
  }

  private async invalidateTopProductsCache(): Promise<void> {
    await this.cacheService.del(CACHE_KEYS.TOP_SERVICES);
    await this.cacheService.del(CACHE_KEYS.TOP_PRODUCTS);
    await this.cacheService.del(CACHE_KEYS.HOMEPAGE);
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.CONTENT}top*`);
  }
}
