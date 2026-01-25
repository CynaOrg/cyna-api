# CYNA — API Endpoints Map

> **Version:** 1.0  
> **Date:** 21 janvier 2026  
> **Stack:** NestJS Microservices + RabbitMQ  
> **Base URL:** `https://api.cyna.fr` (production) | `http://localhost:3000` (dev)

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Conventions](#conventions)
3. [Auth Service (3001)](#1-auth-service-3001)
4. [User Service (3005)](#2-user-service-3005)
5. [Catalog Service (3002)](#3-catalog-service-3002)
6. [Order Service (3003)](#4-order-service-3003)
7. [Payment Service (3004)](#5-payment-service-3004)
8. [Content Service (3007)](#6-content-service-3007)
9. [Notification Service (3006)](#7-notification-service-3006)
10. [Analytics Service (3008)](#8-analytics-service-3008)
11. [Webhooks](#9-webhooks)
12. [Codes d'erreur](#10-codes-derreur)

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (Port 3000)                           │
│         Routing • JWT Validation • Rate Limiting • Request Logging          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /api/v1/auth/*        → Auth Service (3001)                                │
│  /api/v1/users/*       → User Service (3005)                                │
│  /api/v1/catalog/*     → Catalog Service (3002)                             │
│  /api/v1/orders/*      → Order Service (3003)                               │
│  /api/v1/payments/*    → Payment Service (3004)                             │
│  /api/v1/content/*     → Content Service (3007)                             │
│  /api/v1/analytics/*   → Analytics Service (3008)                           │
│                                                                             │
│  /api/v1/admin/*       → Routes admin (2FA required)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Répartition des endpoints par service

| Service | Préfixe | Endpoints | Description |
|---------|---------|-----------|-------------|
| Auth | `/api/v1/auth` | 12 | Authentification, 2FA, tokens |
| User | `/api/v1/users` | 14 | Profils, adresses, abonnements |
| Catalog | `/api/v1/catalog` | 22 | Produits, catégories, recherche, stock |
| Order | `/api/v1/orders` | 18 | Panier, commandes, checkout |
| Payment | `/api/v1/payments` | 10 | Stripe, subscriptions |
| Content | `/api/v1/content` | 12 | Carrousel, top produits, contact |
| Analytics | `/api/v1/analytics` | 8 | KPIs, rapports, exports |

---

## Conventions

### Authentification

| Type | Header | Description |
|------|--------|-------------|
| Bearer Token | `Authorization: Bearer <access_token>` | JWT access token (15 min) |
| Refresh Token | Cookie `refresh_token` (HttpOnly) | Refresh token (7 jours) |
| Session Guest | Cookie `session_id` (HttpOnly) | Session invité (7 jours) |

### Niveaux d'accès

| Niveau | Description |
|--------|-------------|
| 🌐 Public | Aucune authentification requise |
| 👤 User | Utilisateur connecté (JWT valide) |
| 🔐 Admin | Administrateur avec 2FA validé |
| 👑 SuperAdmin | Super administrateur uniquement |

### Format des réponses

Le succès ou l'échec est déterminé par le **code HTTP** (REST standard) :
- `2xx` → Succès
- `4xx` → Erreur client
- `5xx` → Erreur serveur

**Succès (2xx) :**
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-21T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

**Erreur (4xx/5xx) :**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "Must be a valid email" }]
  },
  "meta": {
    "timestamp": "2026-01-21T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

### Pagination

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Langues

Header `Accept-Language: fr` ou `Accept-Language: en` (défaut: `fr`)

---

## 1. Auth Service (3001)

Gestion de l'authentification utilisateurs et administrateurs.

### 1.1 Authentification Client

#### POST `/api/v1/auth/register` 🌐
Inscription d'un nouvel utilisateur.

**Request Body:**
```json
{
  "email": "user@company.com",
  "password": "SecureP@ss123",
  "firstName": "Jean",
  "lastName": "Dupont",
  "companyName": "Acme Corp",
  "preferredLanguage": "fr"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@company.com",
      "firstName": "Jean",
      "lastName": "Dupont",
      "isVerified": false
    },
    "message": "Verification email sent"
  }
}
```

---

#### POST `/api/v1/auth/login` 🌐
Connexion utilisateur.

**Request Body:**
```json
{
  "email": "user@company.com",
  "password": "SecureP@ss123",
  "rememberMe": true
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "user@company.com",
      "firstName": "Jean",
      "lastName": "Dupont",
      "isVerified": true
    }
  }
}
```
*Note: `refresh_token` envoyé en cookie HttpOnly*

---

#### POST `/api/v1/auth/logout` 👤
Déconnexion (invalidation du refresh token).

**Response:** `200 OK`
```json
{
  "data": { "message": "Logged out successfully" }
}
```

---

#### POST `/api/v1/auth/refresh` 🌐
Rafraîchissement du token d'accès.

**Request:** Cookie `refresh_token` requis

**Response:** `200 OK`
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900
  }
}
```

---

#### POST `/api/v1/auth/verify-email` 🌐
Vérification de l'email après inscription.

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "Email verified successfully" }
}
```

---

#### POST `/api/v1/auth/resend-verification` 🌐
Renvoi de l'email de vérification.

**Request Body:**
```json
{
  "email": "user@company.com"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "Verification email sent" }
}
```

---

#### POST `/api/v1/auth/forgot-password` 🌐
Demande de réinitialisation du mot de passe.

**Request Body:**
```json
{
  "email": "user@company.com"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "Password reset email sent" }
}
```

---

#### POST `/api/v1/auth/reset-password` 🌐
Réinitialisation du mot de passe avec token.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecureP@ss456"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "Password reset successfully" }
}
```

---

### 1.2 Authentification Admin

#### POST `/api/v1/auth/admin/login` 🌐
Première étape de connexion admin (email + password).

**Request Body:**
```json
{
  "email": "admin@cyna.fr",
  "password": "AdminP@ss123"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "requires2FA": true,
    "tempToken": "temp_token_for_2fa",
    "message": "2FA code sent to email"
  }
}
```

---

#### POST `/api/v1/auth/admin/verify-2fa` 🌐
Seconde étape: validation du code 2FA.

**Request Body:**
```json
{
  "tempToken": "temp_token_for_2fa",
  "code": "123456"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900,
    "admin": {
      "id": "uuid",
      "email": "admin@cyna.fr",
      "firstName": "Admin",
      "lastName": "Cyna",
      "role": "super_admin"
    }
  }
}
```

---

#### POST `/api/v1/auth/admin/resend-2fa` 🌐
Renvoi du code 2FA.

**Request Body:**
```json
{
  "tempToken": "temp_token_for_2fa"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "2FA code resent" }
}
```

---

#### POST `/api/v1/auth/admin/logout` 🔐
Déconnexion admin.

**Response:** `200 OK`

---

## 2. User Service (3005)

Gestion des profils utilisateurs, adresses et abonnements.

### 2.1 Profil Utilisateur

#### GET `/api/v1/users/me` 👤
Récupération du profil de l'utilisateur connecté.

**Response:** `200 OK`
```json
{
  "data": {
    "id": "uuid",
    "email": "user@company.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "companyName": "Acme Corp",
    "preferredLanguage": "fr",
    "isVerified": true,
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

---

#### PATCH `/api/v1/users/me` 👤
Mise à jour du profil.

**Request Body:**
```json
{
  "firstName": "Jean-Pierre",
  "lastName": "Dupont",
  "companyName": "Acme Corporation",
  "preferredLanguage": "en"
}
```

**Response:** `200 OK`

---

#### PATCH `/api/v1/users/me/email` 👤
Changement d'email (nécessite vérification).

**Request Body:**
```json
{
  "newEmail": "newemail@company.com",
  "currentPassword": "SecureP@ss123"
}
```

**Response:** `200 OK`
```json
{
  "data": { "message": "Verification email sent to new address" }
}
```

---

#### PATCH `/api/v1/users/me/password` 👤
Changement de mot de passe.

**Request Body:**
```json
{
  "currentPassword": "SecureP@ss123",
  "newPassword": "NewSecureP@ss456"
}
```

**Response:** `200 OK`

---

#### DELETE `/api/v1/users/me` 👤
Suppression du compte (soft delete).

**Request Body:**
```json
{
  "currentPassword": "SecureP@ss123",
  "confirmation": "DELETE"
}
```

**Response:** `200 OK`

---

### 2.2 Adresses

#### GET `/api/v1/users/me/addresses` 👤
Liste des adresses de l'utilisateur.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "label": "Bureau",
      "firstName": "Jean",
      "lastName": "Dupont",
      "company": "Acme Corp",
      "streetLine1": "123 Rue de la Paix",
      "streetLine2": "Bâtiment A",
      "city": "Paris",
      "postalCode": "75001",
      "country": "FR",
      "phone": "+33612345678",
      "isDefaultBilling": true,
      "isDefaultShipping": false
    }
  ]
}
```

---

#### POST `/api/v1/users/me/addresses` 👤
Ajout d'une nouvelle adresse.

**Request Body:**
```json
{
  "label": "Domicile",
  "firstName": "Jean",
  "lastName": "Dupont",
  "streetLine1": "456 Avenue des Champs",
  "city": "Lyon",
  "postalCode": "69001",
  "country": "FR",
  "phone": "+33698765432",
  "isDefaultBilling": false,
  "isDefaultShipping": true
}
```

**Response:** `201 Created`

---

#### GET `/api/v1/users/me/addresses/:addressId` 👤
Détail d'une adresse.

---

#### PATCH `/api/v1/users/me/addresses/:addressId` 👤
Mise à jour d'une adresse.

---

#### DELETE `/api/v1/users/me/addresses/:addressId` 👤
Suppression d'une adresse.

---

### 2.3 Abonnements Utilisateur

#### GET `/api/v1/users/me/subscriptions` 👤
Liste des abonnements actifs de l'utilisateur.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "product": {
        "id": "uuid",
        "name": "SOC Premium",
        "slug": "soc-premium"
      },
      "status": "active",
      "billingPeriod": "monthly",
      "price": 299.00,
      "currency": "EUR",
      "currentPeriodStart": "2026-01-01T00:00:00Z",
      "currentPeriodEnd": "2026-02-01T00:00:00Z",
      "cancelAtPeriodEnd": false
    }
  ]
}
```

---

#### GET `/api/v1/users/me/subscriptions/:subscriptionId` 👤
Détail d'un abonnement.

---

### 2.4 Admin - Gestion Utilisateurs

#### GET `/api/v1/admin/users` 🔐
Liste des utilisateurs (paginée).

**Query Parameters:**
- `page` (int): Page courante (défaut: 1)
- `limit` (int): Éléments par page (défaut: 20, max: 100)
- `search` (string): Recherche email/nom
- `isActive` (boolean): Filtrer par statut
- `sortBy` (string): `createdAt`, `email`, `lastName`
- `sortOrder` (string): `asc`, `desc`

**Response:** `200 OK`
```json
{
  "data": [...],
  "pagination": { ... }
}
```

---

#### GET `/api/v1/admin/users/:userId` 🔐
Détail d'un utilisateur.

---

#### PATCH `/api/v1/admin/users/:userId/status` 🔐
Activation/désactivation d'un utilisateur.

**Request Body:**
```json
{
  "isActive": false
}
```

---

## 3. Catalog Service (3002)

Gestion du catalogue produits, catégories et recherche.

### 3.1 Catégories (Public)

#### GET `/api/v1/catalog/categories` 🌐
Liste des catégories actives.

**Query Parameters:**
- `lang` (string): `fr` ou `en` (défaut: header Accept-Language)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "services",
      "name": "Services",
      "description": "Solutions SaaS de cybersécurité",
      "imageUrl": "https://cdn.cyna.fr/categories/services.jpg",
      "displayOrder": 1,
      "productCount": 3
    },
    {
      "id": "uuid",
      "slug": "produits",
      "name": "Produits",
      "description": "Hardware et licences",
      "imageUrl": "https://cdn.cyna.fr/categories/produits.jpg",
      "displayOrder": 2,
      "productCount": 8
    }
  ]
}
```

---

#### GET `/api/v1/catalog/categories/:slug` 🌐
Détail d'une catégorie avec ses produits.

**Query Parameters:**
- `page`, `limit`: Pagination des produits
- `productType` (string): `saas`, `digital`, `physical`
- `sortBy` (string): `displayOrder`, `price`, `createdAt`
- `sortOrder` (string): `asc`, `desc`

**Response:** `200 OK`
```json
{
  "data": {
    "category": {
      "id": "uuid",
      "slug": "services",
      "name": "Services",
      "description": "...",
      "imageUrl": "..."
    },
    "products": [...],
    "pagination": { ... }
  }
}
```

---

### 3.2 Produits (Public)

#### GET `/api/v1/catalog/products` 🌐
Liste des produits avec filtres.

**Query Parameters:**
- `page`, `limit`: Pagination
- `categorySlug` (string): Filtrer par catégorie
- `productType` (string): `saas`, `digital`, `physical`
- `isAvailable` (boolean): Disponibilité
- `isFeatured` (boolean): Produits mis en avant
- `minPrice`, `maxPrice` (number): Fourchette de prix
- `search` (string): Recherche dans nom/description
- `sortBy` (string): `displayOrder`, `priceMonthly`, `priceUnit`, `createdAt`
- `sortOrder` (string): `asc`, `desc`

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "soc-premium",
      "sku": "SOC-001",
      "name": "SOC Premium",
      "shortDescription": "Surveillance continue 24/7",
      "productType": "saas",
      "priceMonthly": 299.00,
      "priceYearly": 2990.00,
      "isAvailable": true,
      "isFeatured": true,
      "primaryImage": {
        "url": "https://cdn.cyna.fr/products/soc-premium.jpg",
        "altText": "SOC Premium"
      },
      "category": {
        "id": "uuid",
        "slug": "services",
        "name": "Services"
      }
    }
  ],
  "pagination": { ... }
}
```

---

#### GET `/api/v1/catalog/products/:slug` 🌐
Détail complet d'un produit.

**Response:** `200 OK`
```json
{
  "data": {
    "id": "uuid",
    "slug": "soc-premium",
    "sku": "SOC-001",
    "name": "SOC Premium",
    "description": "Notre solution SOC Premium offre une surveillance continue...",
    "shortDescription": "Surveillance continue 24/7",
    "productType": "saas",
    "priceMonthly": 299.00,
    "priceYearly": 2990.00,
    "isAvailable": true,
    "isFeatured": true,
    "images": [
      {
        "id": "uuid",
        "url": "https://cdn.cyna.fr/products/soc-1.jpg",
        "altText": "SOC Premium - Dashboard",
        "isPrimary": true,
        "displayOrder": 1
      }
    ],
    "characteristics": [
      {
        "key": "Surveillance",
        "value": "24/7"
      },
      {
        "key": "Support",
        "value": "Premium"
      }
    ],
    "category": {
      "id": "uuid",
      "slug": "services",
      "name": "Services"
    },
    "relatedProducts": [...]
  }
}
```

---

#### GET `/api/v1/catalog/products/featured` 🌐
Produits mis en avant (Top produits).

**Query Parameters:**
- `limit` (int): Nombre de produits (défaut: 6)
- `productType` (string): Filtrer par type

---

### 3.3 Recherche

#### GET `/api/v1/catalog/search` 🌐
Recherche full-text dans les produits.

**Query Parameters:**
- `q` (string, required): Terme de recherche (min 2 caractères)
- `page`, `limit`: Pagination
- `categorySlug`, `productType`, `minPrice`, `maxPrice`: Filtres
- `sortBy`, `sortOrder`: Tri

**Response:** `200 OK`
```json
{
  "data": {
    "query": "SOC",
    "results": [...],
    "totalResults": 3,
    "searchTime": 45
  },
  "pagination": { ... }
}
```
*Note: `searchTime` en millisecondes, objectif < 500ms*

---

### 3.4 Stock (Produits physiques)

#### GET `/api/v1/catalog/products/:slug/stock` 🌐
Vérification de la disponibilité en stock.

**Response:** `200 OK`
```json
{
  "data": {
    "productId": "uuid",
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

### 3.5 Admin - Gestion Catalogue

#### POST `/api/v1/admin/catalog/categories` 👑
Création d'une catégorie.

**Request Body:**
```json
{
  "slug": "accessoires",
  "nameFr": "Accessoires",
  "nameEn": "Accessories",
  "descriptionFr": "Accessoires de sécurité",
  "descriptionEn": "Security accessories",
  "displayOrder": 3,
  "isActive": true
}
```

---

#### PATCH `/api/v1/admin/catalog/categories/:categoryId` 👑
Mise à jour d'une catégorie.

---

#### DELETE `/api/v1/admin/catalog/categories/:categoryId` 👑
Suppression d'une catégorie (si aucun produit associé).

---

#### POST `/api/v1/admin/catalog/categories/:categoryId/image` 👑
Upload de l'image de catégorie.

**Request:** `multipart/form-data`
- `image`: Fichier image (max 5MB, formats: jpg, png, webp)

---

#### GET `/api/v1/admin/catalog/products` 🔐
Liste des produits (admin, inclut inactifs).

---

#### POST `/api/v1/admin/catalog/products` 👑
Création d'un produit.

**Request Body:**
```json
{
  "categoryId": "uuid",
  "slug": "edr-advanced",
  "sku": "EDR-001",
  "nameFr": "EDR Advanced",
  "nameEn": "EDR Advanced",
  "descriptionFr": "Protection avancée des terminaux...",
  "descriptionEn": "Advanced endpoint protection...",
  "shortDescriptionFr": "Protection endpoints",
  "shortDescriptionEn": "Endpoint protection",
  "productType": "saas",
  "priceMonthly": 199.00,
  "priceYearly": 1990.00,
  "isAvailable": true,
  "isFeatured": false,
  "displayOrder": 2,
  "characteristics": [
    { "keyFr": "Endpoints", "keyEn": "Endpoints", "valueFr": "Illimités", "valueEn": "Unlimited" }
  ]
}
```

---

#### GET `/api/v1/admin/catalog/products/:productId` 🔐
Détail d'un produit (admin).

---

#### PATCH `/api/v1/admin/catalog/products/:productId` 👑
Mise à jour d'un produit.

---

#### DELETE `/api/v1/admin/catalog/products/:productId` 👑
Suppression d'un produit (soft delete).

---

#### POST `/api/v1/admin/catalog/products/:productId/images` 👑
Upload d'images produit.

**Request:** `multipart/form-data`
- `images[]`: Fichiers images (max 10 images, 5MB chacune)
- `isPrimary`: Index de l'image principale (optionnel)

---

#### DELETE `/api/v1/admin/catalog/products/:productId/images/:imageId` 👑
Suppression d'une image.

---

#### PATCH `/api/v1/admin/catalog/products/:productId/images/reorder` 👑
Réorganisation des images.

**Request Body:**
```json
{
  "imageIds": ["uuid1", "uuid2", "uuid3"]
}
```

---

#### PATCH `/api/v1/admin/catalog/products/:productId/stock` 👑
Mise à jour du stock (produits physiques).

**Request Body:**
```json
{
  "stockQuantity": 100,
  "stockAlertThreshold": 15
}
```

---

#### GET `/api/v1/admin/catalog/stock/alerts` 🔐
Produits avec stock bas.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "productId": "uuid",
      "name": "Baie Serveur 42U",
      "sku": "PHY-001",
      "stockQuantity": 5,
      "stockAlertThreshold": 10,
      "reservedQuantity": 2,
      "availableQuantity": 3
    }
  ]
}
```

---

## 4. Order Service (3003)

Gestion du panier et des commandes.

### 4.1 Panier (Produits digital/physical uniquement)

#### GET `/api/v1/orders/cart` 👤 / 🌐
Récupération du panier.

*Note: Pour les guests, utilise le cookie `session_id`*

**Response:** `200 OK`
```json
{
  "data": {
    "id": "uuid",
    "items": [
      {
        "id": "uuid",
        "product": {
          "id": "uuid",
          "slug": "station-blanche",
          "name": "Station Blanche USB",
          "productType": "physical",
          "priceUnit": 1200.00,
          "primaryImage": { ... },
          "isAvailable": true,
          "availableStock": 15
        },
        "quantity": 2,
        "unitPrice": 1200.00,
        "totalPrice": 2400.00
      }
    ],
    "subtotal": 2400.00,
    "itemCount": 2,
    "hasPhysicalProducts": true,
    "hasDigitalProducts": false
  }
}
```

---

#### POST `/api/v1/orders/cart/items` 👤 / 🌐
Ajout d'un article au panier.

**Request Body:**
```json
{
  "productId": "uuid",
  "quantity": 1
}
```

**Response:** `201 Created`

*Note: Refuse les produits `saas` avec erreur `SAAS_NOT_IN_CART`*

---

#### PATCH `/api/v1/orders/cart/items/:itemId` 👤 / 🌐
Mise à jour de la quantité.

**Request Body:**
```json
{
  "quantity": 3
}
```

---

#### DELETE `/api/v1/orders/cart/items/:itemId` 👤 / 🌐
Suppression d'un article.

---

#### DELETE `/api/v1/orders/cart` 👤 / 🌐
Vider le panier.

---

#### POST `/api/v1/orders/cart/merge` 👤
Fusion du panier guest vers utilisateur (après login).

**Request Body:**
```json
{
  "guestSessionId": "session_xyz"
}
```

---

### 4.2 Checkout (Produits digital/physical)

#### POST `/api/v1/orders/checkout/validate` 👤 / 🌐
Validation du panier avant checkout.

**Response:** `200 OK`
```json
{
  "data": {
    "isValid": true,
    "cart": { ... },
    "issues": [],
    "requiresShipping": true,
    "requiresAuth": false
  }
}
```

**Possible issues:**
```json
{
  "issues": [
    { "type": "OUT_OF_STOCK", "productId": "uuid", "productName": "...", "available": 0 },
    { "type": "INSUFFICIENT_STOCK", "productId": "uuid", "requested": 5, "available": 2 },
    { "type": "PRODUCT_UNAVAILABLE", "productId": "uuid" }
  ]
}
```

---

#### POST `/api/v1/orders/checkout/start` 👤 / 🌐
Démarrage du checkout (crée les réservations de stock).

**Request Body:**
```json
{
  "guestEmail": "guest@email.com"
}
```
*Note: `guestEmail` requis uniquement si non connecté*

**Response:** `200 OK`
```json
{
  "data": {
    "checkoutId": "uuid",
    "expiresAt": "2026-01-21T11:00:00Z",
    "cart": { ... },
    "stockReservations": [
      { "productId": "uuid", "quantity": 2, "expiresAt": "..." }
    ]
  }
}
```
*Note: Réservation valide 15 minutes*

---

#### POST `/api/v1/orders/checkout/:checkoutId/billing-address` 👤 / 🌐
Définition de l'adresse de facturation.

**Request Body:**
```json
{
  "addressId": "uuid"
}
```
OU
```json
{
  "address": {
    "firstName": "Jean",
    "lastName": "Dupont",
    "company": "Acme Corp",
    "streetLine1": "123 Rue de la Paix",
    "city": "Paris",
    "postalCode": "75001",
    "country": "FR",
    "phone": "+33612345678"
  },
  "saveAddress": true
}
```

---

#### POST `/api/v1/orders/checkout/:checkoutId/shipping-address` 👤 / 🌐
Définition de l'adresse de livraison (si produits physiques).

**Request Body:** Même format que billing-address

---

#### POST `/api/v1/orders/checkout/:checkoutId/complete` 👤 / 🌐
Finalisation du checkout → Redirection vers paiement Stripe.

**Response:** `200 OK`
```json
{
  "data": {
    "orderId": "uuid",
    "orderNumber": "CYN-2026-00001",
    "stripeCheckoutUrl": "https://checkout.stripe.com/...",
    "expiresAt": "2026-01-21T11:30:00Z"
  }
}
```

---

### 4.3 Achat SaaS Direct

#### POST `/api/v1/orders/subscribe` 👤
Souscription directe à un service SaaS (sans panier).

**Request Body:**
```json
{
  "productId": "uuid",
  "billingPeriod": "monthly",
  "billingAddressId": "uuid"
}
```
OU avec nouvelle adresse:
```json
{
  "productId": "uuid",
  "billingPeriod": "yearly",
  "billingAddress": {
    "firstName": "Jean",
    "lastName": "Dupont",
    "streetLine1": "123 Rue de la Paix",
    "city": "Paris",
    "postalCode": "75001",
    "country": "FR"
  },
  "saveAddress": true
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "subscriptionId": "uuid",
    "stripeCheckoutUrl": "https://checkout.stripe.com/...",
    "product": {
      "name": "SOC Premium",
      "price": 299.00,
      "billingPeriod": "monthly"
    }
  }
}
```

---

### 4.4 Commandes

#### GET `/api/v1/orders` 👤
Historique des commandes de l'utilisateur.

**Query Parameters:**
- `page`, `limit`: Pagination
- `status` (string): Filtrer par statut
- `year` (int): Filtrer par année
- `sortOrder` (string): `asc`, `desc` (défaut: `desc`)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "orderNumber": "CYN-2026-00001",
      "status": "delivered",
      "orderType": "physical",
      "total": 2400.00,
      "currency": "EUR",
      "itemCount": 2,
      "createdAt": "2026-01-15T10:00:00Z",
      "paidAt": "2026-01-15T10:05:00Z",
      "deliveredAt": "2026-01-20T14:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

#### GET `/api/v1/orders/:orderId` 👤
Détail d'une commande.

**Response:** `200 OK`
```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "CYN-2026-00001",
    "status": "delivered",
    "orderType": "physical",
    "subtotal": 2400.00,
    "taxAmount": 480.00,
    "shippingAmount": 0.00,
    "discountAmount": 0.00,
    "total": 2880.00,
    "currency": "EUR",
    "items": [
      {
        "id": "uuid",
        "productSnapshot": {
          "name": "Station Blanche USB",
          "sku": "PHY-002"
        },
        "quantity": 2,
        "unitPrice": 1200.00,
        "totalPrice": 2400.00,
        "billingPeriod": "one_time"
      }
    ],
    "billingAddress": { ... },
    "shippingAddress": { ... },
    "trackingNumber": "1Z999AA10123456784",
    "trackingUrl": "https://track.ups.com/...",
    "createdAt": "2026-01-15T10:00:00Z",
    "paidAt": "2026-01-15T10:05:00Z",
    "shippedAt": "2026-01-17T09:00:00Z",
    "deliveredAt": "2026-01-20T14:00:00Z"
  }
}
```

---

#### GET `/api/v1/orders/:orderId/invoice` 👤
Téléchargement de la facture PDF.

**Response:** `200 OK`
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="CYN-2026-00001.pdf"`

---

### 4.5 Admin - Gestion Commandes

#### GET `/api/v1/admin/orders` 🔐
Liste des commandes (admin).

**Query Parameters:**
- `page`, `limit`: Pagination
- `status` (string): Filtrer par statut
- `orderType` (string): `saas`, `digital`, `physical`, `mixed`
- `dateFrom`, `dateTo` (ISO date): Période
- `search` (string): Recherche par numéro ou email client
- `sortBy`, `sortOrder`: Tri

---

#### GET `/api/v1/admin/orders/:orderId` 🔐
Détail d'une commande (admin).

---

#### PATCH `/api/v1/admin/orders/:orderId/status` 🔐
Mise à jour du statut.

**Request Body:**
```json
{
  "status": "shipped",
  "trackingNumber": "1Z999AA10123456784",
  "trackingUrl": "https://track.ups.com/...",
  "notes": "Expédié via UPS Express"
}
```

---

#### POST `/api/v1/admin/orders/:orderId/refund` 👑
Remboursement d'une commande.

**Request Body:**
```json
{
  "amount": 2880.00,
  "reason": "Customer request"
}
```

---

## 5. Payment Service (3004)

Intégration Stripe pour paiements et abonnements.

### 5.1 Méthodes de paiement

#### GET `/api/v1/payments/methods` 👤
Liste des méthodes de paiement enregistrées.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "pm_xxx",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "expMonth": 12,
        "expYear": 2028
      },
      "isDefault": true
    }
  ]
}
```

---

#### POST `/api/v1/payments/methods/setup` 👤
Création d'une SetupIntent pour ajouter une carte.

**Response:** `200 OK`
```json
{
  "data": {
    "clientSecret": "seti_xxx_secret_xxx"
  }
}
```

---

#### DELETE `/api/v1/payments/methods/:paymentMethodId` 👤
Suppression d'une méthode de paiement.

---

#### PATCH `/api/v1/payments/methods/:paymentMethodId/default` 👤
Définir comme méthode par défaut.

---

### 5.2 Abonnements

#### GET `/api/v1/payments/subscriptions` 👤
Liste des abonnements avec détails de paiement.

---

#### PATCH `/api/v1/payments/subscriptions/:subscriptionId/billing-period` 👤
Changement de période de facturation (mensuel ↔ annuel).

**Request Body:**
```json
{
  "billingPeriod": "yearly"
}
```

---

#### POST `/api/v1/payments/subscriptions/:subscriptionId/cancel` 👤
Annulation d'un abonnement (fin de période).

**Request Body:**
```json
{
  "cancelAtPeriodEnd": true,
  "reason": "Too expensive"
}
```

---

#### POST `/api/v1/payments/subscriptions/:subscriptionId/reactivate` 👤
Réactivation d'un abonnement annulé.

---

### 5.3 Admin - Gestion Abonnements

#### GET `/api/v1/admin/payments/subscriptions` 🔐
Liste des abonnements (admin).

**Query Parameters:**
- `status`: `active`, `past_due`, `cancelled`, `unpaid`, `paused`
- `page`, `limit`, `sortBy`, `sortOrder`

---

#### PATCH `/api/v1/admin/payments/subscriptions/:subscriptionId/status` 👑
Modification du statut d'un abonnement.

**Request Body:**
```json
{
  "action": "pause"
}
```

**Actions possibles:** `pause`, `resume`, `cancel_immediately`

---

## 6. Content Service (3007)

Gestion du contenu dynamique de la page d'accueil.

### 6.1 Contenu Public

#### GET `/api/v1/content/homepage` 🌐
Récupération de tout le contenu de la homepage.

**Response:** `200 OK`
```json
{
  "data": {
    "carousel": [
      {
        "id": "uuid",
        "title": "Protection XDR Avancée",
        "subtitle": "Nouveau",
        "imageUrl": "https://cdn.cyna.fr/carousel/xdr.jpg",
        "linkUrl": "/products/xdr-enterprise",
        "linkText": "Découvrir",
        "displayOrder": 1,
        "isActive": true
      }
    ],
    "topServices": [...],
    "topProducts": [...],
    "heroText": {
      "title": "La protection de votre entreprise commence ici",
      "subtitle": "Solutions de cybersécurité adaptées à vos enjeux."
    }
  }
}
```

---

#### GET `/api/v1/content/carousel` 🌐
Slides du carrousel uniquement.

---

#### GET `/api/v1/content/top-services` 🌐
Top services SaaS.

**Query Parameters:**
- `limit` (int): Nombre de produits (défaut: 4)

---

#### GET `/api/v1/content/top-products` 🌐
Top produits (digital + physical).

**Query Parameters:**
- `limit` (int): Nombre de produits (défaut: 4)

---

### 6.2 Contact

#### POST `/api/v1/content/contact` 🌐
Envoi d'un message via le formulaire de contact.

**Request Body:**
```json
{
  "name": "Jean Dupont",
  "email": "jean@company.com",
  "subject": "Question sur SOC Premium",
  "message": "Bonjour, je souhaiterais avoir plus d'informations..."
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "messageId": "uuid",
    "message": "Message sent successfully"
  }
}
```

---

### 6.3 Admin - Gestion Contenu

#### GET `/api/v1/admin/content/carousel` 🔐
Liste des slides du carrousel.

---

#### POST `/api/v1/admin/content/carousel` 👑
Création d'un slide.

**Request Body:**
```json
{
  "titleFr": "Protection XDR Avancée",
  "titleEn": "Advanced XDR Protection",
  "subtitleFr": "Nouveau",
  "subtitleEn": "New",
  "linkUrl": "/products/xdr-enterprise",
  "linkTextFr": "Découvrir",
  "linkTextEn": "Discover",
  "displayOrder": 1,
  "isActive": true
}
```

---

#### POST `/api/v1/admin/content/carousel/:slideId/image` 👑
Upload de l'image d'un slide.

---

#### PATCH `/api/v1/admin/content/carousel/:slideId` 👑
Mise à jour d'un slide.

---

#### DELETE `/api/v1/admin/content/carousel/:slideId` 👑
Suppression d'un slide.

---

#### PATCH `/api/v1/admin/content/carousel/reorder` 👑
Réorganisation des slides.

**Request Body:**
```json
{
  "slideIds": ["uuid1", "uuid2", "uuid3"]
}
```

---

#### PATCH `/api/v1/admin/content/top-services` 👑
Configuration des top services.

**Request Body:**
```json
{
  "productIds": ["uuid1", "uuid2", "uuid3", "uuid4"]
}
```

---

#### PATCH `/api/v1/admin/content/top-products` 👑
Configuration des top produits.

---

#### PATCH `/api/v1/admin/content/hero-text` 👑
Mise à jour du texte hero.

**Request Body:**
```json
{
  "titleFr": "La protection de votre entreprise commence ici",
  "titleEn": "Your business protection starts here",
  "subtitleFr": "Solutions de cybersécurité adaptées à vos enjeux.",
  "subtitleEn": "Cybersecurity solutions tailored to your needs."
}
```

---

#### GET `/api/v1/admin/content/contact-messages` 🔐
Liste des messages de contact.

**Query Parameters:**
- `isRead` (boolean): Filtrer par statut lecture
- `isProcessed` (boolean): Filtrer par statut traitement
- `page`, `limit`, `sortBy`, `sortOrder`

---

#### PATCH `/api/v1/admin/content/contact-messages/:messageId` 🔐
Mise à jour d'un message (marquer lu/traité).

**Request Body:**
```json
{
  "isRead": true,
  "isProcessed": true,
  "notes": "Répondu par email le 21/01"
}
```

---

#### DELETE `/api/v1/admin/content/contact-messages/:messageId` 👑
Suppression d'un message.

---

## 7. Notification Service (3006)

*Note: Ce service communique principalement via RabbitMQ et n'expose que quelques endpoints de monitoring.*

### 7.1 Admin - Monitoring

#### GET `/api/v1/admin/notifications/status` 🔐
Statut du service de notifications.

**Response:** `200 OK`
```json
{
  "data": {
    "status": "healthy",
    "emailProvider": "sendgrid",
    "emailProviderStatus": "operational",
    "queueSize": 5,
    "lastEmailSent": "2026-01-21T10:25:00Z"
  }
}
```

---

#### GET `/api/v1/admin/notifications/logs` 🔐
Logs des notifications envoyées.

**Query Parameters:**
- `type`: `order_confirmation`, `shipping_update`, `password_reset`, `verification`, `stock_alert`
- `status`: `sent`, `failed`, `pending`
- `dateFrom`, `dateTo`
- `page`, `limit`

---

## 8. Analytics Service (3008)

Tableaux de bord et rapports pour le back-office.

### 8.1 Dashboard KPIs

#### GET `/api/v1/admin/analytics/dashboard` 🔐
KPIs principaux du dashboard.

**Query Parameters:**
- `period`: `today`, `week`, `month`, `year` (défaut: `month`)

**Response:** `200 OK`
```json
{
  "data": {
    "period": "month",
    "revenue": {
      "total": 45000.00,
      "recurring": 35000.00,
      "oneTime": 10000.00,
      "currency": "EUR",
      "changePercent": 12.5
    },
    "orders": {
      "total": 150,
      "completed": 142,
      "pending": 5,
      "cancelled": 3,
      "changePercent": 8.2
    },
    "subscriptions": {
      "active": 120,
      "new": 15,
      "churned": 3,
      "mrr": 35000.00,
      "changePercent": 10.0
    },
    "averageOrderValue": 300.00,
    "conversionRate": 3.5
  }
}
```

---

#### GET `/api/v1/admin/analytics/sales` 🔐
Historique des ventes.

**Query Parameters:**
- `period`: `week`, `month`, `quarter`, `year`
- `groupBy`: `day`, `week`, `month`

**Response:** `200 OK`
```json
{
  "data": {
    "period": "month",
    "groupBy": "day",
    "series": [
      { "date": "2026-01-01", "revenue": 1500.00, "orders": 5 },
      { "date": "2026-01-02", "revenue": 2200.00, "orders": 8 },
      ...
    ],
    "totals": {
      "revenue": 45000.00,
      "orders": 150
    }
  }
}
```

---

#### GET `/api/v1/admin/analytics/sales-by-category` 🔐
Répartition des ventes par catégorie.

**Query Parameters:**
- `period`: `week`, `month`, `quarter`, `year`

**Response:** `200 OK`
```json
{
  "data": {
    "period": "month",
    "categories": [
      { "categoryId": "uuid", "name": "Services", "revenue": 35000.00, "percentage": 77.8 },
      { "categoryId": "uuid", "name": "Produits", "revenue": 10000.00, "percentage": 22.2 }
    ]
  }
}
```

---

#### GET `/api/v1/admin/analytics/sales-by-product-type` 🔐
Répartition par type de produit.

**Response:** `200 OK`
```json
{
  "data": {
    "period": "month",
    "productTypes": [
      { "type": "saas", "revenue": 35000.00, "percentage": 77.8, "count": 120 },
      { "type": "physical", "revenue": 8000.00, "percentage": 17.8, "count": 25 },
      { "type": "digital", "revenue": 2000.00, "percentage": 4.4, "count": 10 }
    ]
  }
}
```

---

#### GET `/api/v1/admin/analytics/average-cart` 🔐
Panier moyen par catégorie.

---

#### GET `/api/v1/admin/analytics/mrr` 🔐
Monthly Recurring Revenue (historique).

**Response:** `200 OK`
```json
{
  "data": {
    "currentMrr": 35000.00,
    "history": [
      { "month": "2025-10", "mrr": 28000.00 },
      { "month": "2025-11", "mrr": 31000.00 },
      { "month": "2025-12", "mrr": 33500.00 },
      { "month": "2026-01", "mrr": 35000.00 }
    ],
    "growth": {
      "monthOverMonth": 4.5,
      "yearOverYear": 25.0
    }
  }
}
```

---

#### GET `/api/v1/admin/analytics/stock` 🔐
État des stocks produits physiques.

**Response:** `200 OK`
```json
{
  "data": {
    "summary": {
      "totalProducts": 10,
      "inStock": 7,
      "lowStock": 2,
      "outOfStock": 1
    },
    "products": [
      {
        "productId": "uuid",
        "name": "Station Blanche USB",
        "sku": "PHY-002",
        "stockQuantity": 50,
        "reservedQuantity": 3,
        "availableQuantity": 47,
        "stockStatus": "in_stock",
        "alertThreshold": 10
      }
    ]
  }
}
```

---

### 8.2 Exports

#### GET `/api/v1/admin/analytics/export/sales` 🔐
Export CSV des ventes.

**Query Parameters:**
- `dateFrom`, `dateTo` (ISO date, required)
- `format`: `csv` (défaut), `xlsx`

**Response:** `200 OK`
- Content-Type: `text/csv` ou `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="sales_2026-01.csv"`

---

#### GET `/api/v1/admin/analytics/export/orders` 🔐
Export des commandes.

---

#### GET `/api/v1/admin/analytics/export/subscriptions` 🔐
Export des abonnements.

---

## 9. Webhooks

### 9.1 Stripe Webhooks

#### POST `/api/v1/webhooks/stripe` 🌐
Réception des événements Stripe.

**Headers requis:**
- `Stripe-Signature`: Signature de vérification

**Événements gérés:**

| Événement | Action |
|-----------|--------|
| `checkout.session.completed` | Confirme commande/abonnement, décrémente stock |
| `checkout.session.expired` | Libère réservations stock |
| `invoice.paid` | Met à jour période abonnement |
| `invoice.payment_failed` | Passe abonnement en `past_due` |
| `customer.subscription.updated` | Synchronise changements |
| `customer.subscription.deleted` | Marque abonnement terminé |

**Response:** `200 OK`
```json
{
  "received": true
}
```

---

## 10. Codes d'erreur

### Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 201 | Créé avec succès |
| 400 | Requête invalide |
| 401 | Non authentifié |
| 403 | Non autorisé |
| 404 | Ressource non trouvée |
| 409 | Conflit (ex: email déjà utilisé) |
| 422 | Entité non traitable (validation) |
| 429 | Trop de requêtes (rate limit) |
| 500 | Erreur serveur |

### Codes d'erreur applicatifs

#### Auth
| Code | Message |
|------|---------|
| `AUTH_INVALID_CREDENTIALS` | Email ou mot de passe incorrect |
| `AUTH_EMAIL_NOT_VERIFIED` | Email non vérifié |
| `AUTH_ACCOUNT_DISABLED` | Compte désactivé |
| `AUTH_TOKEN_EXPIRED` | Token expiré |
| `AUTH_TOKEN_INVALID` | Token invalide |
| `AUTH_2FA_REQUIRED` | Code 2FA requis |
| `AUTH_2FA_INVALID` | Code 2FA invalide |
| `AUTH_2FA_EXPIRED` | Code 2FA expiré |

#### User
| Code | Message |
|------|---------|
| `USER_NOT_FOUND` | Utilisateur non trouvé |
| `USER_EMAIL_EXISTS` | Email déjà utilisé |
| `USER_INVALID_PASSWORD` | Mot de passe actuel incorrect |

#### Catalog
| Code | Message |
|------|---------|
| `PRODUCT_NOT_FOUND` | Produit non trouvé |
| `CATEGORY_NOT_FOUND` | Catégorie non trouvée |
| `CATEGORY_HAS_PRODUCTS` | Catégorie non vide |

#### Order
| Code | Message |
|------|---------|
| `CART_EMPTY` | Panier vide |
| `CART_ITEM_NOT_FOUND` | Article non trouvé dans le panier |
| `SAAS_NOT_IN_CART` | Les produits SaaS ne peuvent pas être ajoutés au panier |
| `PRODUCT_UNAVAILABLE` | Produit indisponible |
| `INSUFFICIENT_STOCK` | Stock insuffisant |
| `CHECKOUT_EXPIRED` | Session de checkout expirée |
| `ORDER_NOT_FOUND` | Commande non trouvée |
| `INVALID_ORDER_STATUS` | Transition de statut invalide |

#### Payment
| Code | Message |
|------|---------|
| `PAYMENT_FAILED` | Paiement échoué |
| `SUBSCRIPTION_NOT_FOUND` | Abonnement non trouvé |
| `SUBSCRIPTION_ALREADY_CANCELLED` | Abonnement déjà annulé |
| `INVALID_BILLING_PERIOD` | Période de facturation invalide |

#### Validation
| Code | Message |
|------|---------|
| `VALIDATION_ERROR` | Erreur de validation |
| `INVALID_FILE_TYPE` | Type de fichier non supporté |
| `FILE_TOO_LARGE` | Fichier trop volumineux |

---

## 📋 Changelog

### v1.0 (21 janvier 2026)
- Version initiale
- 8 microservices documentés
- ~96 endpoints au total
- Flux SaaS direct (sans panier) clairement séparé du flux panier (digital/physical)
