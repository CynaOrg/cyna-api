import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CynaLoggerService } from '@cyna-api/common';
import { Category, Product, ProductType, ProductCharacteristic } from '../entities';

interface SeedCategory {
  slug: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  displayOrder: number;
}

interface SeedProduct {
  slug: string;
  sku: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  shortDescriptionFr: string;
  shortDescriptionEn: string;
  productType: ProductType;
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  stockQuantity?: number;
  isFeatured: boolean;
  displayOrder: number;
  categorySlug: string;
  characteristics: Array<{
    keyFr: string;
    keyEn: string;
    valueFr: string;
    valueEn: string;
  }>;
}

const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'services',
    nameFr: 'Services',
    nameEn: 'Services',
    descriptionFr: 'Solutions SaaS de cybersécurité pour protéger votre entreprise',
    descriptionEn: 'Cybersecurity SaaS solutions to protect your business',
    displayOrder: 1,
  },
  {
    slug: 'produits',
    nameFr: 'Produits',
    nameEn: 'Products',
    descriptionFr: 'Équipements et produits physiques de cybersécurité',
    descriptionEn: 'Cybersecurity hardware and physical products',
    displayOrder: 2,
  },
];

const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: 'soc-premium',
    sku: 'SOC-001',
    nameFr: 'SOC Premium',
    nameEn: 'SOC Premium',
    descriptionFr:
      'Notre solution SOC Premium offre une surveillance continue 24/7 de votre infrastructure. ' +
      'Nos experts analysent en temps réel les menaces potentielles et interviennent immédiatement ' +
      "pour neutraliser toute tentative d'intrusion. Bénéficiez d'une protection de niveau entreprise " +
      'avec des rapports détaillés et un tableau de bord personnalisé.',
    descriptionEn:
      'Our SOC Premium solution provides 24/7 continuous monitoring of your infrastructure. ' +
      'Our experts analyze potential threats in real-time and immediately intervene to neutralize ' +
      'any intrusion attempt. Benefit from enterprise-level protection with detailed reports ' +
      'and a personalized dashboard.',
    shortDescriptionFr: 'Surveillance continue 24/7 de votre infrastructure',
    shortDescriptionEn: '24/7 continuous monitoring of your infrastructure',
    productType: ProductType.SAAS,
    priceMonthly: 299,
    priceYearly: 2990,
    isFeatured: true,
    displayOrder: 1,
    categorySlug: 'services',
    characteristics: [
      { keyFr: 'Surveillance', keyEn: 'Monitoring', valueFr: '24/7', valueEn: '24/7' },
      {
        keyFr: 'Temps de réponse',
        keyEn: 'Response time',
        valueFr: '< 15 minutes',
        valueEn: '< 15 minutes',
      },
      {
        keyFr: 'Support',
        keyEn: 'Support',
        valueFr: 'Premium dédié',
        valueEn: 'Dedicated premium',
      },
      { keyFr: 'Rapports', keyEn: 'Reports', valueFr: 'Hebdomadaires', valueEn: 'Weekly' },
    ],
  },
  {
    slug: 'edr-advanced',
    sku: 'EDR-001',
    nameFr: 'EDR Advanced',
    nameEn: 'EDR Advanced',
    descriptionFr:
      'Protection et surveillance avancée des terminaux avec détection comportementale. ' +
      "Notre solution EDR Advanced détecte les menaces connues et inconnues grâce à l'intelligence artificielle. " +
      'Protégez tous vos endpoints (postes de travail, serveurs, mobiles) avec une solution unifiée.',
    descriptionEn:
      'Advanced endpoint protection and monitoring with behavioral detection. ' +
      'Our EDR Advanced solution detects known and unknown threats using artificial intelligence. ' +
      'Protect all your endpoints (workstations, servers, mobile devices) with a unified solution.',
    shortDescriptionFr: 'Protection avancée des terminaux avec IA',
    shortDescriptionEn: 'Advanced endpoint protection with AI',
    productType: ProductType.SAAS,
    priceMonthly: 199,
    priceYearly: 1990,
    isFeatured: true,
    displayOrder: 2,
    categorySlug: 'services',
    characteristics: [
      { keyFr: 'Endpoints', keyEn: 'Endpoints', valueFr: 'Illimités', valueEn: 'Unlimited' },
      {
        keyFr: 'Détection',
        keyEn: 'Detection',
        valueFr: 'Temps réel + IA',
        valueEn: 'Real-time + AI',
      },
      {
        keyFr: 'Plateformes',
        keyEn: 'Platforms',
        valueFr: 'Windows, macOS, Linux',
        valueEn: 'Windows, macOS, Linux',
      },
      { keyFr: 'Isolation', keyEn: 'Isolation', valueFr: 'Automatique', valueEn: 'Automatic' },
    ],
  },
  {
    slug: 'xdr-enterprise',
    sku: 'XDR-001',
    nameFr: 'XDR Enterprise',
    nameEn: 'XDR Enterprise',
    descriptionFr:
      'Solution de détection et réponse étendue combinant EDR et corrélation des menaces cross-sources. ' +
      "XDR Enterprise unifie la visibilité sur l'ensemble de votre infrastructure : endpoints, réseau, cloud, " +
      "email. Bénéficiez d'une détection automatisée et d'une réponse orchestrée aux incidents.",
    descriptionEn:
      'Extended detection and response solution combining EDR and cross-source threat correlation. ' +
      'XDR Enterprise unifies visibility across your entire infrastructure: endpoints, network, cloud, ' +
      'email. Benefit from automated detection and orchestrated incident response.',
    shortDescriptionFr: 'Détection et réponse étendue unifiée',
    shortDescriptionEn: 'Unified extended detection and response',
    productType: ProductType.SAAS,
    priceMonthly: 499,
    priceYearly: 4990,
    isFeatured: true,
    displayOrder: 3,
    categorySlug: 'services',
    characteristics: [
      {
        keyFr: 'Couverture',
        keyEn: 'Coverage',
        valueFr: 'Endpoints + Réseau + Cloud',
        valueEn: 'Endpoints + Network + Cloud',
      },
      {
        keyFr: 'Corrélation',
        keyEn: 'Correlation',
        valueFr: 'Cross-sources IA',
        valueEn: 'AI cross-source',
      },
      { keyFr: 'SOAR intégré', keyEn: 'Integrated SOAR', valueFr: 'Oui', valueEn: 'Yes' },
      {
        keyFr: 'Threat Intelligence',
        keyEn: 'Threat Intelligence',
        valueFr: 'Temps réel',
        valueEn: 'Real-time',
      },
    ],
  },
];

@Injectable()
export class InitialDataSeeder implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductCharacteristic)
    private readonly characteristicRepository: Repository<ProductCharacteristic>,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const shouldSeed = this.configService.get<boolean>('catalog.seed.enabled', false);
    if (!shouldSeed) {
      this.logger.debug('Seeding disabled, skipping initial data');
      return;
    }

    await this.seed();
  }

  async seed(): Promise<void> {
    this.logger.log('Starting catalog initial data seeding...');

    const categoriesCreated = await this.seedCategories();
    const productsCreated = await this.seedProducts();

    this.logger.log(
      `Seeding completed: ${categoriesCreated} categories, ${productsCreated} products`,
    );
  }

  private async seedCategories(): Promise<number> {
    let created = 0;

    for (const categoryData of SEED_CATEGORIES) {
      const existing = await this.categoryRepository.findOne({
        where: { slug: categoryData.slug },
      });

      if (existing) {
        this.logger.debug(`Category '${categoryData.slug}' already exists, skipping`);
        continue;
      }

      const category = this.categoryRepository.create({
        slug: categoryData.slug,
        nameFr: categoryData.nameFr,
        nameEn: categoryData.nameEn,
        descriptionFr: categoryData.descriptionFr,
        descriptionEn: categoryData.descriptionEn,
        displayOrder: categoryData.displayOrder,
        isActive: true,
      });

      await this.categoryRepository.save(category);
      this.logger.log(`Created category: ${categoryData.slug}`);
      created++;
    }

    return created;
  }

  private async seedProducts(): Promise<number> {
    let created = 0;

    for (const productData of SEED_PRODUCTS) {
      const existing = await this.productRepository.findOne({
        where: { sku: productData.sku },
      });

      if (existing) {
        this.logger.debug(`Product '${productData.sku}' already exists, skipping`);
        continue;
      }

      const category = await this.categoryRepository.findOne({
        where: { slug: productData.categorySlug },
      });

      if (!category) {
        this.logger.warn(
          `Category '${productData.categorySlug}' not found, skipping product ${productData.sku}`,
        );
        continue;
      }

      const product = this.productRepository.create({
        categoryId: category.id,
        slug: productData.slug,
        sku: productData.sku,
        nameFr: productData.nameFr,
        nameEn: productData.nameEn,
        descriptionFr: productData.descriptionFr,
        descriptionEn: productData.descriptionEn,
        shortDescriptionFr: productData.shortDescriptionFr,
        shortDescriptionEn: productData.shortDescriptionEn,
        productType: productData.productType,
        priceMonthly: productData.priceMonthly,
        priceYearly: productData.priceYearly,
        priceUnit: productData.priceUnit,
        stockQuantity: productData.stockQuantity,
        isFeatured: productData.isFeatured,
        displayOrder: productData.displayOrder,
        isAvailable: true,
      });

      await this.productRepository.save(product);

      for (let i = 0; i < productData.characteristics.length; i++) {
        const charData = productData.characteristics[i];
        const characteristic = this.characteristicRepository.create({
          productId: product.id,
          keyFr: charData.keyFr,
          keyEn: charData.keyEn,
          valueFr: charData.valueFr,
          valueEn: charData.valueEn,
          displayOrder: i + 1,
        });
        await this.characteristicRepository.save(characteristic);
      }

      this.logger.log(`Created product: ${productData.sku} (${productData.nameFr})`);
      created++;
    }

    return created;
  }
}
