# Catalog Service

Microservice de gestion du catalogue produits pour la plateforme CYNA.

## Table des matières

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage](#démarrage)
- [Variables d'environnement](#variables-denvironnement)
- [Architecture](#architecture)
- [Endpoints API](#endpoints-api)
  - [Categories (Public)](#categories-public)
  - [Categories (Admin)](#categories-admin)
  - [Products (Public)](#products-public)
  - [Products (Admin)](#products-admin)
  - [Images (Admin)](#images-admin)
  - [Stock (Public)](#stock-public)
  - [Stock (Admin)](#stock-admin)
  - [Search](#search)
- [Exemples Postman](#exemples-postman)
- [Seed Data](#seed-data)

---

## Prérequis

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** et **Docker Compose** (pour PostgreSQL et RabbitMQ)
- **PostgreSQL** 16+
- **RabbitMQ** 3.x

## Installation

```bash
# Depuis la racine du projet cyna-api
npm install
```

## Démarrage

### 1. Démarrer l'infrastructure

```bash
# Depuis la racine du projet
docker-compose up -d
```

Cela démarre :

- PostgreSQL sur le port `5433`
- RabbitMQ sur le port `5672` (Management UI: `15672`)
- Redis sur le port `6379`

### 2. Démarrer les services

```bash
# Démarrer tous les services (recommandé)
npm run start:dev:all

# Ou démarrer uniquement le catalog-service et l'api-gateway
npm run start:dev:gateway
npm run start:dev:catalog
```

### 3. Vérifier le fonctionnement

- API Gateway: `http://localhost:3000`
- Catalog Service: Port `3002` (communication RabbitMQ uniquement)
- RabbitMQ Management: `http://localhost:15672` (guest/guest)

---

## Variables d'environnement

| Variable                           | Description                    | Défaut                  |
| ---------------------------------- | ------------------------------ | ----------------------- |
| `DATABASE_HOST`                    | Hôte PostgreSQL                | `localhost`             |
| `DATABASE_PORT`                    | Port PostgreSQL                | `5433`                  |
| `DATABASE_USER`                    | Utilisateur DB                 | `cyna`                  |
| `DATABASE_PASSWORD`                | Mot de passe DB                | `cyna_dev`              |
| `DATABASE_NAME`                    | Nom de la base                 | `cyna_db`               |
| `RABBITMQ_URL`                     | URL RabbitMQ                   | `amqp://localhost:5672` |
| `STOCK_RESERVATION_EXPIRY_MINUTES` | Durée réservation stock        | `15`                    |
| `STOCK_ALERT_DEFAULT_THRESHOLD`    | Seuil alerte stock par défaut  | `10`                    |
| `CATALOG_SEED_ENABLED`             | Activer le seeding automatique | `false`                 |
| `NODE_ENV`                         | Environnement                  | `development`           |

---

## Architecture

```
catalog-service/
├── src/
│   ├── config/              # Configuration (catalog.config.ts)
│   ├── controllers/         # Contrôleur RabbitMQ (MessagePattern)
│   ├── cron/                # Tâches planifiées (cleanup reservations)
│   ├── dto/                 # Data Transfer Objects
│   ├── entities/            # Entités TypeORM
│   ├── events/              # Publication d'événements RabbitMQ
│   ├── seeds/               # Données initiales
│   ├── services/            # Logique métier
│   ├── catalog.module.ts    # Module principal
│   └── main.ts              # Bootstrap microservice
```

### Entités

| Entité                  | Table                     | Description                        |
| ----------------------- | ------------------------- | ---------------------------------- |
| `Category`              | `categories`              | Catégories de produits             |
| `Product`               | `products`                | Produits (SaaS, digital, physical) |
| `ProductImage`          | `product_images`          | Images des produits                |
| `ProductCharacteristic` | `product_characteristics` | Caractéristiques clé/valeur        |
| `StockReservation`      | `stock_reservations`      | Réservations de stock temporaires  |

### Types de produits

| Type       | Description              | Prix                          | Stock           |
| ---------- | ------------------------ | ----------------------------- | --------------- |
| `saas`     | Services avec abonnement | `priceMonthly`, `priceYearly` | Non applicable  |
| `digital`  | Produits dématérialisés  | `priceUnit`                   | Non applicable  |
| `physical` | Produits physiques       | `priceUnit`                   | `stockQuantity` |

---

## Endpoints API

> **Note:** Le catalog-service communique via RabbitMQ. Les endpoints ci-dessous sont exposés par l'API Gateway sur `http://localhost:3000`.

### Headers communs

| Header            | Valeur             | Description                 |
| ----------------- | ------------------ | --------------------------- |
| `Content-Type`    | `application/json` | Type de contenu             |
| `Accept-Language` | `fr` ou `en`       | Langue des réponses         |
| `Authorization`   | `Bearer <token>`   | Token JWT (endpoints admin) |

### Codes d'erreur

| Code HTTP | Code Application         | Description                                 |
| --------- | ------------------------ | ------------------------------------------- |
| 400       | `STOCK_NOT_APPLICABLE`   | Stock non applicable (produit non physique) |
| 400       | `INSUFFICIENT_STOCK`     | Stock insuffisant                           |
| 400       | `CATEGORY_HAS_PRODUCTS`  | Catégorie non vide                          |
| 404       | `PRODUCT_NOT_FOUND`      | Produit non trouvé                          |
| 404       | `CATEGORY_NOT_FOUND`     | Catégorie non trouvée                       |
| 404       | `RESERVATIONS_NOT_FOUND` | Réservations non trouvées                   |
| 409       | `SLUG_ALREADY_EXISTS`    | Slug déjà utilisé                           |
| 409       | `SKU_ALREADY_EXISTS`     | SKU déjà utilisé                            |

---

## Categories (Public)

### GET `/api/v1/catalog/categories`

Liste toutes les catégories actives.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `lang` | `fr` \| `en` | Langue des contenus |
| `includeProducts` | `boolean` | Inclure le nombre de produits |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "services",
      "name": "Services",
      "description": "Solutions SaaS de cybersécurité",
      "imageUrl": null,
      "displayOrder": 1,
      "productCount": 3
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "slug": "produits",
      "name": "Produits",
      "description": "Équipements et produits physiques",
      "imageUrl": null,
      "displayOrder": 2,
      "productCount": 0
    }
  ]
}
```

---

### GET `/api/v1/catalog/categories/:slug`

Détail d'une catégorie par son slug.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `slug` | `string` | Slug de la catégorie |

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `lang` | `fr` \| `en` | Langue des contenus |

**Response:** `200 OK`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "services",
    "name": "Services",
    "description": "Solutions SaaS de cybersécurité pour protéger votre entreprise",
    "imageUrl": null,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
}
```

**Erreurs:**
| Code | Description |
|------|-------------|
| 404 | Catégorie non trouvée |

---

## Categories (Admin)

### POST `/api/v1/admin/catalog/categories`

Crée une nouvelle catégorie.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "slug": "accessoires",
  "nameFr": "Accessoires",
  "nameEn": "Accessories",
  "descriptionFr": "Accessoires de sécurité informatique",
  "descriptionEn": "IT security accessories",
  "displayOrder": 3,
  "isActive": true
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "slug": "accessoires",
    "nameFr": "Accessoires",
    "nameEn": "Accessories",
    "descriptionFr": "Accessoires de sécurité informatique",
    "descriptionEn": "IT security accessories",
    "imageUrl": null,
    "displayOrder": 3,
    "isActive": true,
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
}
```

**Erreurs:**
| Code | Description |
|------|-------------|
| 400 | Données invalides |
| 409 | Slug déjà existant |

---

### PATCH `/api/v1/admin/catalog/categories/:categoryId`

Met à jour une catégorie.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "nameFr": "Accessoires Sécurité",
  "displayOrder": 4
}
```

**Response:** `200 OK`

---

### DELETE `/api/v1/admin/catalog/categories/:categoryId`

Supprime une catégorie.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`

```json
{
  "data": {
    "success": true
  }
}
```

**Erreurs:**
| Code | Description |
|------|-------------|
| 400 | Catégorie contient des produits |
| 404 | Catégorie non trouvée |

---

## Products (Public)

### GET `/api/v1/catalog/products`

Liste tous les produits avec filtres et pagination.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | `number` | Page (défaut: 1) |
| `limit` | `number` | Éléments par page (défaut: 20, max: 100) |
| `categorySlug` | `string` | Filtrer par catégorie |
| `productType` | `saas` \| `digital` \| `physical` | Filtrer par type |
| `isAvailable` | `boolean` | Filtrer par disponibilité |
| `isFeatured` | `boolean` | Produits mis en avant |
| `minPrice` | `number` | Prix minimum |
| `maxPrice` | `number` | Prix maximum |
| `sortBy` | `string` | Champ de tri |
| `sortOrder` | `asc` \| `desc` | Ordre de tri |
| `lang` | `fr` \| `en` | Langue des contenus |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "slug": "soc-premium",
      "sku": "SOC-001",
      "name": "SOC Premium",
      "shortDescription": "Surveillance continue 24/7 de votre infrastructure",
      "productType": "saas",
      "priceMonthly": 299.0,
      "priceYearly": 2990.0,
      "isAvailable": true,
      "isFeatured": true,
      "primaryImage": null,
      "category": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "services",
        "name": "Services"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### GET `/api/v1/catalog/products/:slug`

Détail complet d'un produit.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `slug` | `string` | Slug du produit |

**Response:** `200 OK`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "slug": "soc-premium",
    "sku": "SOC-001",
    "name": "SOC Premium",
    "description": "Notre solution SOC Premium offre une surveillance continue 24/7...",
    "shortDescription": "Surveillance continue 24/7 de votre infrastructure",
    "productType": "saas",
    "priceMonthly": 299.0,
    "priceYearly": 2990.0,
    "priceUnit": null,
    "stockQuantity": null,
    "isAvailable": true,
    "isFeatured": true,
    "displayOrder": 1,
    "images": [],
    "characteristics": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440020",
        "key": "Surveillance",
        "value": "24/7",
        "displayOrder": 1
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440021",
        "key": "Temps de réponse",
        "value": "< 15 minutes",
        "displayOrder": 2
      }
    ],
    "category": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "services",
      "name": "Services"
    },
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
}
```

---

### GET `/api/v1/catalog/products/featured`

Produits mis en avant (Top produits).

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | `number` | Nombre de produits (défaut: 6) |
| `productType` | `string` | Filtrer par type |
| `lang` | `fr` \| `en` | Langue des contenus |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "slug": "soc-premium",
      "name": "SOC Premium",
      "shortDescription": "Surveillance continue 24/7",
      "productType": "saas",
      "priceMonthly": 299.0,
      "priceYearly": 2990.0,
      "isFeatured": true,
      "primaryImage": null
    }
  ]
}
```

---

## Products (Admin)

### POST `/api/v1/admin/catalog/products`

Crée un nouveau produit.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "firewall-enterprise",
  "sku": "FW-001",
  "nameFr": "Firewall Enterprise",
  "nameEn": "Enterprise Firewall",
  "descriptionFr": "Solution firewall de nouvelle génération...",
  "descriptionEn": "Next-generation firewall solution...",
  "shortDescriptionFr": "Firewall nouvelle génération",
  "shortDescriptionEn": "Next-gen firewall",
  "productType": "physical",
  "priceUnit": 2500.0,
  "stockQuantity": 50,
  "stockAlertThreshold": 10,
  "isAvailable": true,
  "isFeatured": false,
  "displayOrder": 5,
  "characteristics": [
    {
      "keyFr": "Débit",
      "keyEn": "Throughput",
      "valueFr": "10 Gbps",
      "valueEn": "10 Gbps"
    }
  ]
}
```

**Response:** `201 Created`

---

### PATCH `/api/v1/admin/catalog/products/:productId`

Met à jour un produit.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "priceMonthly": 349.0,
  "priceYearly": 3490.0,
  "isFeatured": true
}
```

**Response:** `200 OK`

---

### DELETE `/api/v1/admin/catalog/products/:productId`

Supprime un produit (soft delete).

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`

---

## Images (Admin)

### POST `/api/v1/admin/catalog/products/:productId/images`

Ajoute une image à un produit.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "imageUrl": "https://cdn.cyna.fr/products/soc-premium-1.jpg",
  "altTextFr": "SOC Premium - Dashboard",
  "altTextEn": "SOC Premium - Dashboard",
  "isPrimary": true
}
```

**Response:** `201 Created`

---

### DELETE `/api/v1/admin/catalog/products/:productId/images/:imageId`

Supprime une image.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`

---

### PATCH `/api/v1/admin/catalog/products/:productId/images/:imageId/primary`

Définit une image comme image principale.

**Response:** `200 OK`

---

### PATCH `/api/v1/admin/catalog/products/:productId/images/reorder`

Réorganise les images.

**Request Body:**

```json
{
  "imageIds": [
    "550e8400-e29b-41d4-a716-446655440030",
    "550e8400-e29b-41d4-a716-446655440031",
    "550e8400-e29b-41d4-a716-446655440032"
  ]
}
```

**Response:** `200 OK`

---

## Stock (Public)

### GET `/api/v1/catalog/products/:slug/stock`

Vérifie la disponibilité en stock d'un produit physique.

**Response:** `200 OK`

```json
{
  "data": {
    "productId": "550e8400-e29b-41d4-a716-446655440040",
    "productType": "physical",
    "stockQuantity": 50,
    "reservedQuantity": 3,
    "availableQuantity": 47,
    "isAvailable": true,
    "stockStatus": "in_stock"
  }
}
```

**Stock statuses:** `in_stock`, `low_stock`, `out_of_stock`

---

### POST `/api/v1/catalog/stock/check-availability`

Vérifie si une quantité est disponible.

**Request Body:**

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440040",
  "quantity": 5
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "productId": "550e8400-e29b-41d4-a716-446655440040",
    "requestedQuantity": 5,
    "availableQuantity": 47,
    "isAvailable": true,
    "stockStatus": "in_stock"
  }
}
```

---

## Stock (Admin)

### PATCH `/api/v1/admin/catalog/products/:productId/stock`

Met à jour le stock d'un produit physique.

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Request Body:**

```json
{
  "stockQuantity": 100,
  "stockAlertThreshold": 15
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440040",
    "stockQuantity": 100,
    "stockAlertThreshold": 15,
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
}
```

---

### GET `/api/v1/admin/catalog/stock/alerts`

Liste les produits avec stock bas (inférieur au seuil d'alerte).

**Headers:**

```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440040",
      "sku": "FW-001",
      "nameFr": "Firewall Enterprise",
      "nameEn": "Enterprise Firewall",
      "stockQuantity": 5,
      "stockAlertThreshold": 10,
      "productType": "physical"
    }
  ]
}
```

---

### POST `/api/v1/catalog/stock/reserve`

Réserve du stock pour un panier (appelé par Order Service).

**Request Body:**

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440040",
  "cartId": "550e8400-e29b-41d4-a716-446655440050",
  "quantity": 2,
  "userId": "550e8400-e29b-41d4-a716-446655440060"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "reservationId": "550e8400-e29b-41d4-a716-446655440070",
    "productId": "550e8400-e29b-41d4-a716-446655440040",
    "cartId": "550e8400-e29b-41d4-a716-446655440050",
    "quantity": 2,
    "expiresAt": "2026-01-29T10:15:00.000Z",
    "createdAt": "2026-01-29T10:00:00.000Z"
  }
}
```

---

### POST `/api/v1/catalog/stock/release`

Libère les réservations d'un panier.

**Request Body:**

```json
{
  "cartId": "550e8400-e29b-41d4-a716-446655440050"
}
```

**Response:** `200 OK`

---

### POST `/api/v1/catalog/stock/confirm`

Confirme les réservations après paiement (décrémente le stock).

**Request Body:**

```json
{
  "cartId": "550e8400-e29b-41d4-a716-446655440050",
  "orderId": "550e8400-e29b-41d4-a716-446655440080"
}
```

**Response:** `200 OK`

---

## Search

### GET `/api/v1/catalog/search`

Recherche full-text dans les produits.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | `string` | Terme de recherche (min 2 caractères) |
| `page` | `number` | Page |
| `limit` | `number` | Éléments par page |
| `categorySlug` | `string` | Filtrer par catégorie |
| `productType` | `string` | Filtrer par type |
| `minPrice` | `number` | Prix minimum |
| `maxPrice` | `number` | Prix maximum |
| `sortBy` | `string` | Champ de tri |
| `sortOrder` | `asc` \| `desc` | Ordre de tri |
| `lang` | `fr` \| `en` | Langue |

**Response:** `200 OK`

```json
{
  "data": {
    "query": "SOC",
    "results": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "slug": "soc-premium",
        "name": "SOC Premium",
        "shortDescription": "Surveillance continue 24/7",
        "productType": "saas",
        "priceMonthly": 299.0
      }
    ],
    "totalResults": 1,
    "searchTime": 45
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Exemples Postman

### Créer une catégorie

```http
POST http://localhost:3000/api/v1/admin/catalog/categories
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "slug": "licences",
  "nameFr": "Licences",
  "nameEn": "Licenses",
  "descriptionFr": "Licences logicielles",
  "descriptionEn": "Software licenses",
  "displayOrder": 3
}
```

### Créer un produit SaaS

```http
POST http://localhost:3000/api/v1/admin/catalog/products
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "siem-pro",
  "sku": "SIEM-001",
  "nameFr": "SIEM Pro",
  "nameEn": "SIEM Pro",
  "descriptionFr": "Solution SIEM complète pour la gestion des événements de sécurité",
  "descriptionEn": "Complete SIEM solution for security event management",
  "shortDescriptionFr": "Gestion centralisée des logs",
  "shortDescriptionEn": "Centralized log management",
  "productType": "saas",
  "priceMonthly": 399,
  "priceYearly": 3990,
  "isAvailable": true,
  "isFeatured": true
}
```

### Rechercher un produit

```http
GET http://localhost:3000/api/v1/catalog/search?q=SOC&lang=fr&limit=10
Accept-Language: fr
```

### Mettre à jour le stock

```http
PATCH http://localhost:3000/api/v1/admin/catalog/products/550e8400-e29b-41d4-a716-446655440040/stock
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "stockQuantity": 100,
  "stockAlertThreshold": 15
}
```

---

## Seed Data

Le service inclut un seeder automatique pour initialiser les données de test.

### Activation

Définir la variable d'environnement :

```bash
CATALOG_SEED_ENABLED=true
```

### Données créées

**Catégories :**
| Slug | Nom FR | Nom EN | Ordre |
|------|--------|--------|-------|
| `services` | Services | Services | 1 |
| `produits` | Produits | Products | 2 |

**Produits SaaS :**
| SKU | Nom | Prix Mensuel | Prix Annuel |
|-----|-----|--------------|-------------|
| `SOC-001` | SOC Premium | 299€ | 2990€ |
| `EDR-001` | EDR Advanced | 199€ | 1990€ |
| `XDR-001` | XDR Enterprise | 499€ | 4990€ |

### Exécution manuelle

Le seeding s'exécute automatiquement au démarrage si `CATALOG_SEED_ENABLED=true`.
Les données existantes ne sont pas écrasées (vérification par slug/SKU).

---

## Events RabbitMQ

Le service émet les événements suivants vers les queues `notification_queue` et `analytics_queue` :

| Event             | Queue        | Description                         |
| ----------------- | ------------ | ----------------------------------- |
| `stock.reserved`  | analytics    | Stock réservé pour un panier        |
| `stock.released`  | analytics    | Réservation libérée                 |
| `stock.confirmed` | analytics    | Réservation confirmée (paiement OK) |
| `stock.low`       | notification | Stock en dessous du seuil d'alerte  |
| `product.created` | analytics    | Nouveau produit créé                |
| `product.updated` | analytics    | Produit mis à jour                  |

---

## Support

Pour toute question ou problème, consultez :

- Documentation API complète : `/docs/API_Endpoints_Map.md`
- Modèle de données : `/docs/Data_Model.md`
- Events RabbitMQ : `/docs/Event_Catalog_RabbitMQ.md`
