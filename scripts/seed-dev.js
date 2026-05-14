/* eslint-disable */
// One-shot seed script for CYNA local dev DB.
// Creates 1 super-admin, 1 commercial-admin, 1 verified user, 3 categories, 11 products with chars + images.
// Idempotent — safe to re-run, only inserts missing rows.

const bcrypt = require('bcrypt');
const { Client } = require('pg');

const DB = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5433', 10),
  user: process.env.DATABASE_USER || 'cyna',
  password: process.env.DATABASE_PASSWORD || 'cyna_dev',
  database: process.env.DATABASE_NAME || 'cyna_db',
};

const ACCOUNTS = {
  superAdmin: {
    email: 'super.admin@cyna.local',
    password: 'SuperAdmin123!',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
  },
  commercialAdmin: {
    email: 'commercial@cyna.local',
    password: 'Commercial123!',
    firstName: 'Camille',
    lastName: 'Commercial',
    role: 'commercial',
  },
  user: {
    email: 'tom.user@cyna.local',
    password: 'User1234!',
    firstName: 'Tom',
    lastName: 'Utilisateur',
  },
};

const CATEGORIES = [
  {
    slug: 'services',
    nameFr: 'Services',
    nameEn: 'Services',
    descFr: 'Solutions SaaS de cybersécurité pour protéger votre entreprise',
    descEn: 'Cybersecurity SaaS solutions to protect your business',
    order: 1,
  },
  {
    slug: 'produits',
    nameFr: 'Produits',
    nameEn: 'Products',
    descFr: 'Équipements et produits physiques de cybersécurité',
    descEn: 'Cybersecurity hardware and physical products',
    order: 2,
  },
  {
    slug: 'licences',
    nameFr: 'Licences',
    nameEn: 'Licenses',
    descFr: 'Licences logicielles professionnelles avec activation',
    descEn: 'Professional software licenses with activation',
    order: 3,
  },
];

const PRODUCTS = [
  // Services SaaS
  {
    slug: 'soc-premium',
    sku: 'SOC-001',
    cat: 'services',
    type: 'saas',
    nameFr: 'SOC Premium',
    nameEn: 'SOC Premium',
    shortFr: 'Surveillance continue 24/7 de votre infrastructure',
    shortEn: '24/7 continuous monitoring of your infrastructure',
    descFr:
      'Surveillance continue 24/7 par nos experts. Détection en temps réel et neutralisation immédiate des menaces.',
    descEn:
      '24/7 continuous monitoring by our experts. Real-time threat detection and neutralization.',
    priceMonthly: 299,
    priceYearly: 2990,
    featured: true,
    available: true,
    order: 1,
    chars: [
      ['Surveillance', 'Monitoring', '24/7', '24/7'],
      ['Temps de réponse', 'Response time', '< 15 min', '< 15 min'],
      ['Support', 'Support', 'Premium dédié', 'Dedicated premium'],
    ],
    img: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80',
  },
  {
    slug: 'edr-advanced',
    sku: 'EDR-001',
    cat: 'services',
    type: 'saas',
    nameFr: 'EDR Advanced',
    nameEn: 'EDR Advanced',
    shortFr: 'Protection avancée des terminaux avec IA',
    shortEn: 'Advanced endpoint protection with AI',
    descFr: 'Protection des terminaux avec détection comportementale et IA. Multi-OS.',
    descEn: 'Endpoint protection with behavioral detection and AI. Multi-OS.',
    priceMonthly: 199,
    priceYearly: 1990,
    featured: true,
    available: true,
    order: 2,
    chars: [
      ['Endpoints', 'Endpoints', 'Illimités', 'Unlimited'],
      ['Détection', 'Detection', 'Temps réel + IA', 'Real-time + AI'],
      ['Plateformes', 'Platforms', 'Windows, macOS, Linux', 'Windows, macOS, Linux'],
    ],
    img: 'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=800&q=80',
  },
  {
    slug: 'xdr-enterprise',
    sku: 'XDR-001',
    cat: 'services',
    type: 'saas',
    nameFr: 'XDR Enterprise',
    nameEn: 'XDR Enterprise',
    shortFr: 'Détection et réponse étendue unifiée',
    shortEn: 'Unified extended detection and response',
    descFr: 'Visibilité unifiée endpoints + réseau + cloud + email avec SOAR intégré.',
    descEn: 'Unified visibility endpoints + network + cloud + email with built-in SOAR.',
    priceMonthly: 499,
    priceYearly: 4990,
    featured: true,
    available: true,
    order: 3,
    chars: [
      ['Couverture', 'Coverage', 'Endpoints+Réseau+Cloud', 'Endpoints+Network+Cloud'],
      ['SOAR', 'SOAR', 'Intégré', 'Built-in'],
    ],
    img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
  },
  {
    slug: 'threat-intelligence',
    sku: 'TI-001',
    cat: 'services',
    type: 'saas',
    nameFr: 'Threat Intelligence',
    nameEn: 'Threat Intelligence',
    shortFr: 'Veille et anticipation des cybermenaces',
    shortEn: 'Cyber threat monitoring and anticipation',
    descFr: "Flux IoC temps réel, rapports d'analyse, alertes personnalisées.",
    descEn: 'Real-time IoC feeds, analysis reports, custom alerts.',
    priceMonthly: 149,
    priceYearly: 1490,
    featured: false,
    available: true,
    order: 4,
    chars: [
      ['Flux IoC', 'IoC Feeds', 'Temps réel', 'Real-time'],
      ['Rapports', 'Reports', 'Quotidiens', 'Daily'],
    ],
    img: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80',
  },
  // Physical
  {
    slug: 'yubikey-5-nfc',
    sku: 'HW-001',
    cat: 'produits',
    type: 'physical',
    nameFr: 'YubiKey 5 NFC',
    nameEn: 'YubiKey 5 NFC',
    shortFr: "Clé d'authentification hardware multi-protocoles",
    shortEn: 'Multi-protocol hardware authentication key',
    descFr: 'Clé FIDO2/U2F/PIV/OTP. Protection contre phishing par NFC ou USB.',
    descEn: 'FIDO2/U2F/PIV/OTP key. Phishing protection via NFC or USB.',
    priceUnit: 59,
    stockQuantity: 150,
    featured: true,
    available: true,
    order: 1,
    chars: [
      ['Protocoles', 'Protocols', 'FIDO2, U2F, PIV, OTP', 'FIDO2, U2F, PIV, OTP'],
      ['Connectivité', 'Connectivity', 'USB-A + NFC', 'USB-A + NFC'],
    ],
    img: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80',
  },
  {
    slug: 'firewall-appliance-pro',
    sku: 'HW-002',
    cat: 'produits',
    type: 'physical',
    nameFr: 'Firewall Appliance Pro',
    nameEn: 'Firewall Appliance Pro',
    shortFr: 'Pare-feu matériel haute performance 10 Gbps',
    shortEn: 'High-performance 10 Gbps hardware firewall',
    descFr: 'Next-gen avec DPI, filtrage applicatif, IPS intégré. 10 Gbps.',
    descEn: 'Next-gen with DPI, app filtering, built-in IPS. 10 Gbps.',
    priceUnit: 1299,
    stockQuantity: 35,
    featured: true,
    available: true,
    order: 2,
    chars: [
      ['Débit', 'Throughput', '10 Gbps', '10 Gbps'],
      ['IPS/IDS', 'IPS/IDS', 'Intégré', 'Built-in'],
    ],
    img: 'https://images.unsplash.com/photo-1606765962248-7ff407b51667?w=800&q=80',
  },
  {
    slug: 'encrypted-usb-256',
    sku: 'HW-003',
    cat: 'produits',
    type: 'physical',
    nameFr: 'Encrypted USB 256 Go',
    nameEn: 'Encrypted USB 256GB',
    shortFr: 'Stockage USB chiffré AES-256 certifié FIPS',
    shortEn: 'FIPS certified AES-256 encrypted USB storage',
    descFr: 'USB 256 Go AES-256 matériel, clavier physique PIN, FIPS 140-2.',
    descEn: '256GB USB AES-256 hardware, physical PIN keypad, FIPS 140-2.',
    priceUnit: 89,
    stockQuantity: 0,
    featured: false,
    available: false,
    order: 3,
    chars: [
      ['Capacité', 'Capacity', '256 Go', '256GB'],
      ['Chiffrement', 'Encryption', 'AES-256', 'AES-256'],
    ],
    img: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=800&q=80',
  },
  // Licenses
  {
    slug: 'microsoft-365-business',
    sku: 'LIC-001',
    cat: 'licences',
    type: 'license',
    nameFr: 'Microsoft 365 Business Premium',
    nameEn: 'Microsoft 365 Business Premium',
    shortFr: 'Suite bureautique et collaboration sécurisée',
    shortEn: 'Secure office suite and collaboration',
    descFr: 'M365 Business Premium avec Defender for Office 365, Teams, OneDrive 1 To.',
    descEn: 'M365 Business Premium with Defender for Office 365, Teams, 1TB OneDrive.',
    priceUnit: 22,
    featured: true,
    available: true,
    order: 1,
    chars: [
      [
        'Applications',
        'Applications',
        'Word, Excel, PowerPoint, Outlook, Teams',
        'Word, Excel, PowerPoint, Outlook, Teams',
      ],
      ['Stockage', 'Storage', '1 To OneDrive', '1 TB OneDrive'],
    ],
    img: 'https://images.unsplash.com/photo-1633419461186-7d40a38105ec?w=800&q=80',
  },
  {
    slug: 'adobe-creative-cloud',
    sku: 'LIC-002',
    cat: 'licences',
    type: 'license',
    nameFr: 'Adobe Creative Cloud Entreprise',
    nameEn: 'Adobe Creative Cloud Enterprise',
    shortFr: 'Suite créative professionnelle complète',
    shortEn: 'Complete professional creative suite',
    descFr: '20+ apps Adobe (Photoshop, Illustrator, Premiere), collaboration cloud.',
    descEn: '20+ Adobe apps (Photoshop, Illustrator, Premiere), cloud collaboration.',
    priceUnit: 54,
    featured: true,
    available: true,
    order: 2,
    chars: [
      ['Apps', 'Apps', '20+', '20+'],
      ['Stockage', 'Storage', '100 Go', '100 GB'],
    ],
    img: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80',
  },
  {
    slug: 'vmware-vsphere-standard',
    sku: 'LIC-003',
    cat: 'licences',
    type: 'license',
    nameFr: 'VMware vSphere Standard',
    nameEn: 'VMware vSphere Standard',
    shortFr: 'Virtualisation enterprise haute disponibilité',
    shortEn: 'Enterprise high-availability virtualization',
    descFr: "Virtualisation avec vMotion + HA, jusqu'à 2 CPU par licence.",
    descEn: 'Virtualization with vMotion + HA, up to 2 CPUs per license.',
    priceUnit: 399,
    featured: true,
    available: true,
    order: 3,
    chars: [
      ['CPU', 'CPU', "Jusqu'à 2", 'Up to 2'],
      ['HA', 'HA', 'vMotion + HA', 'vMotion + HA'],
    ],
    img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
  },
  {
    slug: 'windows-server-2025',
    sku: 'LIC-004',
    cat: 'licences',
    type: 'license',
    nameFr: 'Windows Server 2025 Standard',
    nameEn: 'Windows Server 2025 Standard',
    shortFr: "Système d'exploitation serveur avec sécurité renforcée",
    shortEn: 'Server operating system with enhanced security',
    descFr: 'Windows Server 2025 avec Azure Arc intégré, Hyper-V illimités.',
    descEn: 'Windows Server 2025 with built-in Azure Arc, unlimited Hyper-V.',
    priceUnit: 899,
    featured: false,
    available: true,
    order: 4,
    chars: [
      ['Cœurs', 'Cores', '16 min', '16 min'],
      ['Cloud hybride', 'Hybrid cloud', 'Azure Arc', 'Azure Arc'],
    ],
    img: 'https://images.unsplash.com/photo-1551808525-51a94da548ce?w=800&q=80',
  },
];

async function main() {
  const client = new Client(DB);
  await client.connect();
  console.log('✅ Connected to DB');

  try {
    // ── Admins ──────────────────────────────────────────────
    for (const key of ['superAdmin', 'commercialAdmin']) {
      const a = ACCOUNTS[key];
      const hash = await bcrypt.hash(a.password, 12);
      await client.query(
        `INSERT INTO admins (email, password_hash, first_name, last_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
        [a.email, hash, a.firstName, a.lastName, a.role],
      );
      console.log(`  ✓ admin: ${a.email} (${a.role})`);
    }

    // ── User ────────────────────────────────────────────────
    const u = ACCOUNTS.user;
    const userHash = await bcrypt.hash(u.password, 12);
    await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_active, is_verified, preferred_language)
       VALUES ($1, $2, $3, $4, true, true, 'fr')
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_verified = true`,
      [u.email, userHash, u.firstName, u.lastName],
    );
    console.log(`  ✓ user:  ${u.email}`);

    // ── Categories ──────────────────────────────────────────
    const catIds = {};
    for (const c of CATEGORIES) {
      const r = await client.query(
        `INSERT INTO categories (slug, name_fr, name_en, description_fr, description_en, display_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (slug) DO UPDATE SET name_fr = EXCLUDED.name_fr
         RETURNING id`,
        [c.slug, c.nameFr, c.nameEn, c.descFr, c.descEn, c.order],
      );
      catIds[c.slug] = r.rows[0].id;
      console.log(`  ✓ category: ${c.slug}`);
    }

    // ── Products ────────────────────────────────────────────
    for (const p of PRODUCTS) {
      const r = await client.query(
        `INSERT INTO products (
           category_id, slug, sku, name_fr, name_en,
           description_fr, description_en, short_description_fr, short_description_en,
           product_type, price_monthly, price_yearly, price_unit, stock_quantity,
           is_featured, is_available, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (sku) DO UPDATE SET name_fr = EXCLUDED.name_fr
         RETURNING id`,
        [
          catIds[p.cat],
          p.slug,
          p.sku,
          p.nameFr,
          p.nameEn,
          p.descFr,
          p.descEn,
          p.shortFr,
          p.shortEn,
          p.type,
          p.priceMonthly ?? null,
          p.priceYearly ?? null,
          p.priceUnit ?? null,
          p.stockQuantity ?? null,
          p.featured,
          p.available,
          p.order,
        ],
      );
      const productId = r.rows[0].id;

      // Clean old chars/images for idempotency
      await client.query(`DELETE FROM product_characteristics WHERE product_id = $1`, [productId]);
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);

      // Characteristics
      for (let i = 0; i < p.chars.length; i++) {
        const [kFr, kEn, vFr, vEn] = p.chars[i];
        await client.query(
          `INSERT INTO product_characteristics (product_id, key_fr, key_en, value_fr, value_en, display_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [productId, kFr, kEn, vFr, vEn, i + 1],
        );
      }

      // 1 primary image
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text_fr, alt_text_en, display_order, is_primary)
         VALUES ($1,$2,$3,$4,0,true)`,
        [productId, p.img, p.nameFr, p.nameEn],
      );
      console.log(`  ✓ product: ${p.sku}`);
    }

    console.log('\n✅ Seed completed successfully');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
