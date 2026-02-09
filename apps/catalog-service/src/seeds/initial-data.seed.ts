import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CynaLoggerService } from '@cyna-api/common';
import { Category, Product, ProductType, ProductCharacteristic, ProductImage } from '../entities';

interface SeedCategory {
  slug: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  displayOrder: number;
}

interface SeedImage {
  imageUrl: string;
  altTextFr: string;
  altTextEn: string;
  displayOrder: number;
  isPrimary: boolean;
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
  isAvailable: boolean;
  displayOrder: number;
  categorySlug: string;
  characteristics: Array<{
    keyFr: string;
    keyEn: string;
    valueFr: string;
    valueEn: string;
  }>;
  images: SeedImage[];
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
  // ── Services (SaaS) ──────────────────────────────────────────────
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
    isAvailable: true,
    displayOrder: 1,
    categorySlug: 'services',
    characteristics: [
      {
        keyFr: 'Surveillance',
        keyEn: 'Monitoring',
        valueFr: '24/7',
        valueEn: '24/7',
      },
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
      {
        keyFr: 'Rapports',
        keyEn: 'Reports',
        valueFr: 'Hebdomadaires',
        valueEn: 'Weekly',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80',
        altTextFr: 'Tableau de bord SOC',
        altTextEn: 'SOC dashboard overview',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f2?w=800&q=80',
        altTextFr: "Centre d'opérations de sécurité",
        altTextEn: 'Security operations center',
        displayOrder: 1,
        isPrimary: false,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1551808525-51a94da548ce?w=800&q=80',
        altTextFr: 'Surveillance en temps réel',
        altTextEn: 'Real-time monitoring',
        displayOrder: 2,
        isPrimary: false,
      },
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
    isAvailable: true,
    displayOrder: 2,
    categorySlug: 'services',
    characteristics: [
      {
        keyFr: 'Endpoints',
        keyEn: 'Endpoints',
        valueFr: 'Illimités',
        valueEn: 'Unlimited',
      },
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
      {
        keyFr: 'Isolation',
        keyEn: 'Isolation',
        valueFr: 'Automatique',
        valueEn: 'Automatic',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=800&q=80',
        altTextFr: 'Sécurité endpoint',
        altTextEn: 'Endpoint security',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&q=80',
        altTextFr: 'Tableau de bord EDR',
        altTextEn: 'EDR detection dashboard',
        displayOrder: 1,
        isPrimary: false,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80',
        altTextFr: 'Analyse comportementale',
        altTextEn: 'Behavioral analysis',
        displayOrder: 2,
        isPrimary: false,
      },
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
    isAvailable: false,
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
      {
        keyFr: 'SOAR intégré',
        keyEn: 'Integrated SOAR',
        valueFr: 'Oui',
        valueEn: 'Yes',
      },
      {
        keyFr: 'Threat Intelligence',
        keyEn: 'Threat Intelligence',
        valueFr: 'Temps réel',
        valueEn: 'Real-time',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
        altTextFr: 'Plateforme XDR',
        altTextEn: 'XDR platform',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1562813733-b31f71025d54?w=800&q=80',
        altTextFr: 'Détection multi-couches',
        altTextEn: 'Multi-layer detection',
        displayOrder: 1,
        isPrimary: false,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80',
        altTextFr: 'Moteur de corrélation',
        altTextEn: 'Correlation engine',
        displayOrder: 2,
        isPrimary: false,
      },
    ],
  },
  {
    slug: 'threat-intelligence',
    sku: 'TI-001',
    nameFr: 'Threat Intelligence',
    nameEn: 'Threat Intelligence',
    descriptionFr:
      'Restez informé des dernières menaces grâce à notre plateforme de Threat Intelligence. ' +
      "Flux d'indicateurs de compromission en temps réel, rapports d'analyse et alertes " +
      'personnalisées pour anticiper les attaques ciblant votre secteur.',
    descriptionEn:
      'Stay informed about the latest threats with our Threat Intelligence platform. ' +
      'Real-time indicators of compromise feeds, analysis reports and customized alerts ' +
      'to anticipate attacks targeting your industry.',
    shortDescriptionFr: 'Veille et anticipation des cybermenaces',
    shortDescriptionEn: 'Cyber threat monitoring and anticipation',
    productType: ProductType.SAAS,
    priceMonthly: 149,
    priceYearly: 1490,
    isFeatured: false,
    isAvailable: true,
    displayOrder: 4,
    categorySlug: 'services',
    characteristics: [
      {
        keyFr: 'Flux IoC',
        keyEn: 'IoC Feeds',
        valueFr: 'Temps réel',
        valueEn: 'Real-time',
      },
      {
        keyFr: 'Rapports',
        keyEn: 'Reports',
        valueFr: 'Quotidiens',
        valueEn: 'Daily',
      },
      {
        keyFr: 'Intégrations',
        keyEn: 'Integrations',
        valueFr: 'SIEM, SOAR, Firewalls',
        valueEn: 'SIEM, SOAR, Firewalls',
      },
      {
        keyFr: 'Alertes',
        keyEn: 'Alerts',
        valueFr: 'Email + Slack + Webhook',
        valueEn: 'Email + Slack + Webhook',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80',
        altTextFr: 'Flux threat intelligence',
        altTextEn: 'Threat intelligence feed',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&q=80',
        altTextFr: 'Analyse de données',
        altTextEn: 'Data analysis',
        displayOrder: 1,
        isPrimary: false,
      },
    ],
  },

  // ── Produits physiques ────────────────────────────────────────────
  {
    slug: 'yubikey-5-nfc',
    sku: 'HW-001',
    nameFr: 'YubiKey 5 NFC',
    nameEn: 'YubiKey 5 NFC',
    descriptionFr:
      "La YubiKey 5 NFC est une clé d'authentification multi-protocoles compatible FIDO2, U2F, PIV et OTP. " +
      'Protégez vos comptes contre le phishing avec une authentification forte par simple contact NFC ou USB.',
    descriptionEn:
      'The YubiKey 5 NFC is a multi-protocol authentication key supporting FIDO2, U2F, PIV and OTP. ' +
      'Protect your accounts against phishing with strong authentication via simple NFC or USB contact.',
    shortDescriptionFr: "Clé d'authentification hardware multi-protocoles",
    shortDescriptionEn: 'Multi-protocol hardware authentication key',
    productType: ProductType.PHYSICAL,
    priceUnit: 59,
    stockQuantity: 150,
    isFeatured: true,
    isAvailable: true,
    displayOrder: 1,
    categorySlug: 'produits',
    characteristics: [
      {
        keyFr: 'Protocoles',
        keyEn: 'Protocols',
        valueFr: 'FIDO2, U2F, PIV, OTP',
        valueEn: 'FIDO2, U2F, PIV, OTP',
      },
      {
        keyFr: 'Connectivité',
        keyEn: 'Connectivity',
        valueFr: 'USB-A + NFC',
        valueEn: 'USB-A + NFC',
      },
      {
        keyFr: 'Résistance',
        keyEn: 'Durability',
        valueFr: 'IP68, incassable',
        valueEn: 'IP68, crush-resistant',
      },
      {
        keyFr: 'Compatibilité',
        keyEn: 'Compatibility',
        valueFr: 'Windows, macOS, Linux, iOS, Android',
        valueEn: 'Windows, macOS, Linux, iOS, Android',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80',
        altTextFr: 'YubiKey 5 NFC',
        altTextEn: 'YubiKey 5 NFC',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=800&q=80',
        altTextFr: 'YubiKey gros plan',
        altTextEn: 'YubiKey close-up',
        displayOrder: 1,
        isPrimary: false,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1618044619888-009e412ff12a?w=800&q=80',
        altTextFr: 'Utilisation clé de sécurité',
        altTextEn: 'Security key usage',
        displayOrder: 2,
        isPrimary: false,
      },
    ],
  },
  {
    slug: 'firewall-appliance-pro',
    sku: 'HW-002',
    nameFr: 'Firewall Appliance Pro',
    nameEn: 'Firewall Appliance Pro',
    descriptionFr:
      'Pare-feu matériel de nouvelle génération avec inspection profonde des paquets, ' +
      "filtrage applicatif et prévention d'intrusion intégrée. Débit jusqu'à 10 Gbps " +
      'sans compromis sur la sécurité.',
    descriptionEn:
      'Next-generation hardware firewall with deep packet inspection, ' +
      'application filtering and integrated intrusion prevention. Throughput up to 10 Gbps ' +
      'without compromising security.',
    shortDescriptionFr: 'Pare-feu matériel haute performance 10 Gbps',
    shortDescriptionEn: 'High-performance 10 Gbps hardware firewall',
    productType: ProductType.PHYSICAL,
    priceUnit: 1299,
    stockQuantity: 35,
    isFeatured: true,
    isAvailable: true,
    displayOrder: 2,
    categorySlug: 'produits',
    characteristics: [
      {
        keyFr: 'Débit',
        keyEn: 'Throughput',
        valueFr: '10 Gbps',
        valueEn: '10 Gbps',
      },
      {
        keyFr: 'Ports',
        keyEn: 'Ports',
        valueFr: '8x GbE + 2x 10GbE SFP+',
        valueEn: '8x GbE + 2x 10GbE SFP+',
      },
      {
        keyFr: 'IPS/IDS',
        keyEn: 'IPS/IDS',
        valueFr: 'Intégré',
        valueEn: 'Built-in',
      },
      {
        keyFr: 'VPN',
        keyEn: 'VPN',
        valueFr: 'IPSec + SSL (500 tunnels)',
        valueEn: 'IPSec + SSL (500 tunnels)',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1606765962248-7ff407b51667?w=800&q=80',
        altTextFr: 'Firewall appliance',
        altTextEn: 'Firewall appliance',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
        altTextFr: 'Infrastructure réseau',
        altTextEn: 'Network infrastructure',
        displayOrder: 1,
        isPrimary: false,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80',
        altTextFr: 'Rack serveur',
        altTextEn: 'Server rack',
        displayOrder: 2,
        isPrimary: false,
      },
    ],
  },
  {
    slug: 'encrypted-usb-256',
    sku: 'HW-003',
    nameFr: 'Encrypted USB 256 Go',
    nameEn: 'Encrypted USB 256GB',
    descriptionFr:
      'Clé USB 256 Go avec chiffrement matériel AES-256 et clavier physique intégré ' +
      'pour la saisie du code PIN. Certifiée FIPS 140-2, elle garantit la protection ' +
      'de vos données sensibles même en cas de perte ou de vol.',
    descriptionEn:
      '256GB USB drive with AES-256 hardware encryption and built-in physical keypad ' +
      'for PIN entry. FIPS 140-2 certified, it ensures protection of your sensitive data ' +
      'even in case of loss or theft.',
    shortDescriptionFr: 'Stockage USB chiffré AES-256 certifié FIPS',
    shortDescriptionEn: 'FIPS certified AES-256 encrypted USB storage',
    productType: ProductType.PHYSICAL,
    priceUnit: 89,
    stockQuantity: 0,
    isFeatured: false,
    isAvailable: false,
    displayOrder: 3,
    categorySlug: 'produits',
    characteristics: [
      {
        keyFr: 'Capacité',
        keyEn: 'Capacity',
        valueFr: '256 Go',
        valueEn: '256GB',
      },
      {
        keyFr: 'Chiffrement',
        keyEn: 'Encryption',
        valueFr: 'AES-256 matériel',
        valueEn: 'AES-256 hardware',
      },
      {
        keyFr: 'Certification',
        keyEn: 'Certification',
        valueFr: 'FIPS 140-2',
        valueEn: 'FIPS 140-2',
      },
      {
        keyFr: 'Interface',
        keyEn: 'Interface',
        valueFr: 'USB 3.2 Gen 1',
        valueEn: 'USB 3.2 Gen 1',
      },
    ],
    images: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=800&q=80',
        altTextFr: 'Clé USB chiffrée',
        altTextEn: 'Encrypted USB drive',
        displayOrder: 0,
        isPrimary: true,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1618044619888-009e412ff12a?w=800&q=80',
        altTextFr: 'Chiffrement USB',
        altTextEn: 'USB encryption',
        displayOrder: 1,
        isPrimary: false,
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
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
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
        isAvailable: productData.isAvailable,
        displayOrder: productData.displayOrder,
      });

      await this.productRepository.save(product);

      // Seed characteristics
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

      // Seed images
      for (const imgData of productData.images) {
        const image = this.imageRepository.create({
          productId: product.id,
          imageUrl: imgData.imageUrl,
          altTextFr: imgData.altTextFr,
          altTextEn: imgData.altTextEn,
          displayOrder: imgData.displayOrder,
          isPrimary: imgData.isPrimary,
        });
        await this.imageRepository.save(image);
      }

      this.logger.log(
        `Created product: ${productData.sku} (${productData.nameFr}) with ${productData.images.length} images`,
      );
      created++;
    }

    return created;
  }
}
