# CYNA — Event Catalog (RabbitMQ)

> **Version:** 1.0  
> **Date:** 21 janvier 2026  
> **Stack:** NestJS + RabbitMQ  
> **Référence:** Architecture Microservices, API Endpoints Map v1.1

---

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Configuration RabbitMQ](#configuration-rabbitmq)
3. [Conventions](#conventions)
4. [Auth Events](#1-auth-events)
5. [User Events](#2-user-events)
6. [Catalog Events](#3-catalog-events)
7. [Order Events](#4-order-events)
8. [Payment Events](#5-payment-events)
9. [Notification Events](#6-notification-events)
10. [Analytics Events](#7-analytics-events)
11. [Flux complets](#8-flux-complets)
12. [Dead Letter Queue](#9-dead-letter-queue)
13. [Monitoring](#10-monitoring)

---

## Vue d'ensemble

### Architecture Event-Driven

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RABBITMQ BROKER                                │
│                              (Port 5672)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         EXCHANGES                                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  cyna.events (topic)      │  Événements métier principaux           │   │
│  │  cyna.notifications (direct) │  Notifications email/push            │   │
│  │  cyna.analytics (fanout)  │  Événements pour analytics              │   │
│  │  cyna.dlx (topic)         │  Dead Letter Exchange                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Auth Service │     │Catalog Service│    │ Order Service │    │Payment Service│
│    (3001)    │     │    (3002)    │     │    (3003)    │     │    (3004)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │  user.registered   │  stock.reserved    │  order.created     │  payment.confirmed
       │  user.verified     │  stock.released    │  order.paid        │  payment.failed
       │  admin.login       │  stock.low         │  order.shipped     │  subscription.created
       │                    │  product.updated   │  cart.updated      │  subscription.cancelled
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                                      │
                                      ▼
       ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
       │ User Service │     │Notification  │     │  Analytics   │
       │    (3005)    │     │   Service    │     │   Service    │
       │              │     │    (3006)    │     │    (3008)    │
       └──────────────┘     └──────────────┘     └──────────────┘
```

### Matrice des événements

| Service émetteur | Événement | Services consommateurs |
|------------------|-----------|------------------------|
| Auth | `user.registered` | Notification, Analytics |
| Auth | `user.verified` | Analytics |
| Auth | `user.login` | Analytics |
| Auth | `admin.login` | Analytics |
| Auth | `password.reset.requested` | Notification |
| Auth | `password.reset.completed` | Analytics |
| Catalog | `product.created` | Analytics |
| Catalog | `product.updated` | Analytics |
| Catalog | `product.deleted` | Analytics |
| Catalog | `stock.reserved` | Order |
| Catalog | `stock.released` | Order |
| Catalog | `stock.confirmed` | Analytics |
| Catalog | `stock.low` | Notification |
| Order | `cart.updated` | Analytics |
| Order | `checkout.started` | Catalog, Analytics |
| Order | `checkout.expired` | Catalog |
| Order | `order.created` | Payment, Notification, Analytics |
| Order | `order.paid` | Catalog, Notification, Analytics |
| Order | `order.shipped` | Notification, Analytics |
| Order | `order.delivered` | Notification, Analytics |
| Order | `order.cancelled` | Catalog, Payment, Notification, Analytics |
| Order | `subscription.initiated` | Payment |
| Payment | `payment.processing` | Order |
| Payment | `payment.confirmed` | Order, Notification, Analytics |
| Payment | `payment.failed` | Order, Notification, Analytics |
| Payment | `payment.refunded` | Order, Notification, Analytics |
| Payment | `subscription.created` | Order, User, Notification, Analytics |
| Payment | `subscription.renewed` | User, Notification, Analytics |
| Payment | `subscription.cancelled` | User, Notification, Analytics |
| Payment | `subscription.past_due` | User, Notification |
| User | `user.updated` | Analytics |
| User | `user.deleted` | Analytics |
| Content | `contact.message.received` | Notification |

---

## Configuration RabbitMQ

### Exchanges

```typescript
// src/common/rabbitmq/exchanges.ts

export const EXCHANGES = {
  // Exchange principal pour les événements métier
  EVENTS: {
    name: 'cyna.events',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
  
  // Exchange pour les notifications
  NOTIFICATIONS: {
    name: 'cyna.notifications',
    type: 'direct',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
  
  // Exchange pour analytics (broadcast)
  ANALYTICS: {
    name: 'cyna.analytics',
    type: 'fanout',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
  
  // Dead Letter Exchange
  DLX: {
    name: 'cyna.dlx',
    type: 'topic',
    options: {
      durable: true,
      autoDelete: false,
    },
  },
};
```

### Queues

```typescript
// src/common/rabbitmq/queues.ts

export const QUEUES = {
  // Auth Service
  AUTH_EVENTS: {
    name: 'auth.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'auth.dlq',
    },
  },
  
  // Catalog Service
  CATALOG_EVENTS: {
    name: 'catalog.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'catalog.dlq',
    },
  },
  
  // Order Service
  ORDER_EVENTS: {
    name: 'order.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'order.dlq',
    },
  },
  
  // Payment Service
  PAYMENT_EVENTS: {
    name: 'payment.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'payment.dlq',
    },
  },
  
  // User Service
  USER_EVENTS: {
    name: 'user.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'user.dlq',
    },
  },
  
  // Notification Service
  NOTIFICATION_EMAILS: {
    name: 'notification.emails',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'notification.dlq',
      messageTtl: 86400000, // 24h
    },
  },
  
  // Analytics Service
  ANALYTICS_EVENTS: {
    name: 'analytics.events',
    options: {
      durable: true,
      deadLetterExchange: 'cyna.dlx',
      deadLetterRoutingKey: 'analytics.dlq',
    },
  },
  
  // Dead Letter Queues
  DLQ_AUTH: { name: 'auth.dlq', options: { durable: true } },
  DLQ_CATALOG: { name: 'catalog.dlq', options: { durable: true } },
  DLQ_ORDER: { name: 'order.dlq', options: { durable: true } },
  DLQ_PAYMENT: { name: 'payment.dlq', options: { durable: true } },
  DLQ_USER: { name: 'user.dlq', options: { durable: true } },
  DLQ_NOTIFICATION: { name: 'notification.dlq', options: { durable: true } },
  DLQ_ANALYTICS: { name: 'analytics.dlq', options: { durable: true } },
};
```

### Routing Keys Pattern

```
<domain>.<entity>.<action>

Exemples:
- auth.user.registered
- catalog.stock.reserved
- order.order.created
- payment.subscription.cancelled
```

---

## Conventions

### Structure d'un événement

```typescript
// src/common/rabbitmq/interfaces/base-event.interface.ts

export interface BaseEvent<T = any> {
  // Métadonnées
  eventId: string;           // UUID unique de l'événement
  eventType: string;         // Type d'événement (routing key)
  timestamp: string;         // ISO 8601
  version: string;           // Version du schéma (ex: "1.0")
  source: string;            // Service émetteur
  correlationId?: string;    // Pour tracer les flux
  
  // Données
  data: T;
}
```

### Exemple d'événement

```json
{
  "eventId": "evt_550e8400-e29b-41d4-a716-446655440000",
  "eventType": "order.order.created",
  "timestamp": "2026-01-21T10:30:00.000Z",
  "version": "1.0",
  "source": "order-service",
  "correlationId": "req_abc123",
  "data": {
    "orderId": "uuid",
    "orderNumber": "CYN-2026-00001",
    "userId": "uuid",
    "total": 299.00,
    "currency": "EUR"
  }
}
```

### Retry Policy

```typescript
// src/common/rabbitmq/retry.config.ts

export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 1 seconde
  maxDelay: 30000,         // 30 secondes
  multiplier: 2,           // Exponential backoff
};

// Délais: 1s → 2s → 4s → DLQ
```

### Idempotence

Chaque consommateur doit gérer l'idempotence via `eventId`:

```typescript
// Vérifier si l'événement a déjà été traité
const processed = await this.eventStore.exists(event.eventId);
if (processed) {
  return; // Ignorer le doublon
}

// Traiter l'événement
await this.processEvent(event);

// Marquer comme traité
await this.eventStore.markProcessed(event.eventId);
```

---

## 1. Auth Events

### user.registered

Émis lors de l'inscription d'un nouvel utilisateur.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.user.registered` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Notification Service, Analytics Service |

```typescript
// Payload
interface UserRegisteredEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  preferredLanguage: 'fr' | 'en';
  verificationToken: string;
  registeredAt: string;
}
```

**Actions déclenchées:**
- Notification: Envoi email de vérification
- Analytics: Incrément compteur inscriptions

---

### user.verified

Émis lors de la vérification de l'email.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.user.verified` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Analytics Service |

```typescript
interface UserVerifiedEvent {
  userId: string;
  email: string;
  verifiedAt: string;
}
```

---

### user.login

Émis lors d'une connexion utilisateur réussie.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.user.login` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Analytics Service |

```typescript
interface UserLoginEvent {
  userId: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  loginAt: string;
}
```

---

### admin.login

Émis lors d'une connexion admin réussie (après 2FA).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.admin.login` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Analytics Service |

```typescript
interface AdminLoginEvent {
  adminId: string;
  email: string;
  role: 'super_admin' | 'commercial';
  ipAddress: string;
  loginAt: string;
}
```

---

### password.reset.requested

Émis lors d'une demande de réinitialisation de mot de passe.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.password.reset.requested` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Notification Service |

```typescript
interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  resetToken: string;
  expiresAt: string;
  requestedAt: string;
}
```

**Actions déclenchées:**
- Notification: Envoi email avec lien de réinitialisation

---

### password.reset.completed

Émis après réinitialisation réussie du mot de passe.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `auth.password.reset.completed` |
| **Émetteur** | Auth Service |
| **Consommateurs** | Analytics Service |

```typescript
interface PasswordResetCompletedEvent {
  userId: string;
  email: string;
  completedAt: string;
}
```

---

## 2. User Events

### user.updated

Émis lors de la mise à jour du profil utilisateur.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `user.user.updated` |
| **Émetteur** | User Service |
| **Consommateurs** | Analytics Service |

```typescript
interface UserUpdatedEvent {
  userId: string;
  updatedFields: string[];
  updatedAt: string;
}
```

---

### user.deleted

Émis lors de la suppression d'un compte utilisateur.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `user.user.deleted` |
| **Émetteur** | User Service |
| **Consommateurs** | Analytics Service |

```typescript
interface UserDeletedEvent {
  userId: string;
  email: string;
  deletedAt: string;
}
```

---

## 3. Catalog Events

### product.created

Émis lors de la création d'un nouveau produit.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.product.created` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Analytics Service |

```typescript
interface ProductCreatedEvent {
  productId: string;
  sku: string;
  name: string;
  productType: 'saas' | 'digital' | 'physical';
  categoryId: string;
  price: {
    monthly?: number;
    yearly?: number;
    unit?: number;
  };
  createdAt: string;
}
```

---

### product.updated

Émis lors de la mise à jour d'un produit.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.product.updated` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Analytics Service |

```typescript
interface ProductUpdatedEvent {
  productId: string;
  sku: string;
  updatedFields: string[];
  updatedAt: string;
}
```

---

### product.deleted

Émis lors de la suppression d'un produit.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.product.deleted` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Analytics Service |

```typescript
interface ProductDeletedEvent {
  productId: string;
  sku: string;
  deletedAt: string;
}
```

---

### stock.reserved

Émis lors de la réservation de stock pendant le checkout.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.stock.reserved` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Order Service |

```typescript
interface StockReservedEvent {
  reservationId: string;
  productId: string;
  cartId: string;
  userId?: string;
  quantity: number;
  expiresAt: string;
  reservedAt: string;
}
```

---

### stock.released

Émis lors de la libération d'une réservation de stock (expiration ou annulation).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.stock.released` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Order Service |

```typescript
interface StockReleasedEvent {
  reservationId: string;
  productId: string;
  cartId: string;
  quantity: number;
  reason: 'expired' | 'cancelled' | 'checkout_failed';
  releasedAt: string;
}
```

---

### stock.confirmed

Émis lors de la confirmation définitive du stock (après paiement).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.stock.confirmed` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Analytics Service |

```typescript
interface StockConfirmedEvent {
  reservationId: string;
  productId: string;
  orderId: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  confirmedAt: string;
}
```

---

### stock.low

Émis lorsque le stock passe sous le seuil d'alerte.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `catalog.stock.low` |
| **Émetteur** | Catalog Service |
| **Consommateurs** | Notification Service |

```typescript
interface StockLowEvent {
  productId: string;
  sku: string;
  productName: string;
  currentStock: number;
  alertThreshold: number;
  detectedAt: string;
}
```

**Actions déclenchées:**
- Notification: Email d'alerte aux admins

---

## 4. Order Events

### cart.updated

Émis lors d'une modification du panier.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.cart.updated` |
| **Émetteur** | Order Service |
| **Consommateurs** | Analytics Service |

```typescript
interface CartUpdatedEvent {
  cartId: string;
  userId?: string;
  sessionId?: string;
  action: 'item_added' | 'item_removed' | 'item_updated' | 'cart_cleared';
  itemCount: number;
  subtotal: number;
  updatedAt: string;
}
```

---

### checkout.started

Émis au démarrage du processus de checkout.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.checkout.started` |
| **Émetteur** | Order Service |
| **Consommateurs** | Catalog Service, Analytics Service |

```typescript
interface CheckoutStartedEvent {
  checkoutId: string;
  cartId: string;
  userId?: string;
  guestEmail?: string;
  items: {
    productId: string;
    productType: 'digital' | 'physical';
    quantity: number;
  }[];
  subtotal: number;
  expiresAt: string;
  startedAt: string;
}
```

**Actions déclenchées:**
- Catalog: Création des réservations de stock (produits physical)

---

### checkout.expired

Émis lorsqu'une session de checkout expire.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.checkout.expired` |
| **Émetteur** | Order Service |
| **Consommateurs** | Catalog Service |

```typescript
interface CheckoutExpiredEvent {
  checkoutId: string;
  cartId: string;
  reservationIds: string[];
  expiredAt: string;
}
```

**Actions déclenchées:**
- Catalog: Libération des réservations de stock

---

### order.created

Émis lors de la création d'une commande (avant paiement).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.order.created` |
| **Émetteur** | Order Service |
| **Consommateurs** | Payment Service, Analytics Service |

```typescript
interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  userId?: string;
  guestEmail?: string;
  orderType: 'digital' | 'physical' | 'mixed';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  stripeCheckoutSessionId: string;
  createdAt: string;
}
```

---

### order.paid

Émis lorsqu'une commande est payée avec succès.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.order.paid` |
| **Émetteur** | Order Service |
| **Consommateurs** | Catalog Service, Notification Service, Analytics Service |

```typescript
interface OrderPaidEvent {
  orderId: string;
  orderNumber: string;
  userId?: string;
  email: string;
  orderType: 'digital' | 'physical' | 'mixed';
  items: {
    productId: string;
    productType: 'digital' | 'physical';
    quantity: number;
  }[];
  total: number;
  currency: string;
  stripePaymentIntentId: string;
  paidAt: string;
}
```

**Actions déclenchées:**
- Catalog: Confirmation des réservations de stock
- Notification: Email de confirmation de commande
- Analytics: Enregistrement vente

---

### order.shipped

Émis lorsqu'une commande physique est expédiée.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.order.shipped` |
| **Émetteur** | Order Service |
| **Consommateurs** | Notification Service, Analytics Service |

```typescript
interface OrderShippedEvent {
  orderId: string;
  orderNumber: string;
  userId?: string;
  email: string;
  trackingNumber: string;
  trackingUrl?: string;
  carrier: string;
  estimatedDelivery?: string;
  shippedAt: string;
}
```

**Actions déclenchées:**
- Notification: Email avec informations de suivi

---

### order.delivered

Émis lorsqu'une commande est livrée.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.order.delivered` |
| **Émetteur** | Order Service |
| **Consommateurs** | Notification Service, Analytics Service |

```typescript
interface OrderDeliveredEvent {
  orderId: string;
  orderNumber: string;
  userId?: string;
  email: string;
  deliveredAt: string;
}
```

---

### order.cancelled

Émis lors de l'annulation d'une commande.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.order.cancelled` |
| **Émetteur** | Order Service |
| **Consommateurs** | Catalog Service, Payment Service, Notification Service, Analytics Service |

```typescript
interface OrderCancelledEvent {
  orderId: string;
  orderNumber: string;
  userId?: string;
  email: string;
  reason: string;
  refundRequired: boolean;
  items: {
    productId: string;
    productType: 'digital' | 'physical';
    quantity: number;
  }[];
  cancelledAt: string;
}
```

**Actions déclenchées:**
- Catalog: Restauration du stock
- Payment: Initiation du remboursement si nécessaire
- Notification: Email de confirmation d'annulation

---

### subscription.initiated

Émis lors de l'initiation d'un abonnement SaaS (avant paiement).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `order.subscription.initiated` |
| **Émetteur** | Order Service |
| **Consommateurs** | Payment Service |

```typescript
interface SubscriptionInitiatedEvent {
  subscriptionId: string;
  userId: string;
  productId: string;
  productName: string;
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  currency: string;
  stripeCheckoutSessionId: string;
  initiatedAt: string;
}
```

---

## 5. Payment Events

### payment.processing

Émis lorsqu'un paiement est en cours de traitement.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.payment.processing` |
| **Émetteur** | Payment Service |
| **Consommateurs** | Order Service |

```typescript
interface PaymentProcessingEvent {
  paymentId: string;
  orderId?: string;
  subscriptionId?: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  processingAt: string;
}
```

---

### payment.confirmed

Émis lorsqu'un paiement est confirmé (webhook Stripe).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.payment.confirmed` |
| **Émetteur** | Payment Service |
| **Consommateurs** | Order Service, Notification Service, Analytics Service |

```typescript
interface PaymentConfirmedEvent {
  paymentId: string;
  orderId?: string;
  subscriptionId?: string;
  stripePaymentIntentId: string;
  stripeChargeId: string;
  amount: number;
  currency: string;
  paymentMethod: {
    type: 'card';
    brand: string;
    last4: string;
  };
  confirmedAt: string;
}
```

**Actions déclenchées:**
- Order: Mise à jour statut commande → `paid`
- Notification: Email de confirmation

---

### payment.failed

Émis lorsqu'un paiement échoue.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.payment.failed` |
| **Émetteur** | Payment Service |
| **Consommateurs** | Order Service, Notification Service, Analytics Service |

```typescript
interface PaymentFailedEvent {
  paymentId: string;
  orderId?: string;
  subscriptionId?: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  errorCode: string;
  errorMessage: string;
  failedAt: string;
}
```

**Actions déclenchées:**
- Order: Annulation checkout, libération stock
- Notification: Email d'échec de paiement

---

### payment.refunded

Émis lors d'un remboursement.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.payment.refunded` |
| **Émetteur** | Payment Service |
| **Consommateurs** | Order Service, Notification Service, Analytics Service |

```typescript
interface PaymentRefundedEvent {
  refundId: string;
  orderId: string;
  stripeRefundId: string;
  amount: number;
  currency: string;
  reason: string;
  refundedAt: string;
}
```

**Actions déclenchées:**
- Order: Mise à jour statut → `refunded`
- Notification: Email de confirmation de remboursement

---

### subscription.created

Émis lors de la création réussie d'un abonnement (après paiement).

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.subscription.created` |
| **Émetteur** | Payment Service |
| **Consommateurs** | Order Service, User Service, Notification Service, Analytics Service |

```typescript
interface SubscriptionCreatedEvent {
  subscriptionId: string;
  userId: string;
  productId: string;
  productName: string;
  stripeSubscriptionId: string;
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}
```

**Actions déclenchées:**
- User: Ajout abonnement au profil
- Notification: Email de bienvenue avec détails de l'abonnement

---

### subscription.renewed

Émis lors du renouvellement automatique d'un abonnement.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.subscription.renewed` |
| **Émetteur** | Payment Service |
| **Consommateurs** | User Service, Notification Service, Analytics Service |

```typescript
interface SubscriptionRenewedEvent {
  subscriptionId: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  previousPeriodEnd: string;
  newPeriodStart: string;
  newPeriodEnd: string;
  renewedAt: string;
}
```

**Actions déclenchées:**
- User: Mise à jour période abonnement
- Notification: Email de confirmation de renouvellement

---

### subscription.cancelled

Émis lors de l'annulation d'un abonnement.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.subscription.cancelled` |
| **Émetteur** | Payment Service |
| **Consommateurs** | User Service, Notification Service, Analytics Service |

```typescript
interface SubscriptionCancelledEvent {
  subscriptionId: string;
  userId: string;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  effectiveDate: string;
  reason?: string;
  cancelledAt: string;
}
```

**Actions déclenchées:**
- User: Mise à jour statut abonnement
- Notification: Email de confirmation d'annulation

---

### subscription.past_due

Émis lorsqu'un paiement d'abonnement échoue.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.events` |
| **Routing Key** | `payment.subscription.past_due` |
| **Émetteur** | Payment Service |
| **Consommateurs** | User Service, Notification Service |

```typescript
interface SubscriptionPastDueEvent {
  subscriptionId: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  amountDue: number;
  currency: string;
  attemptCount: number;
  nextRetryAt?: string;
  pastDueAt: string;
}
```

**Actions déclenchées:**
- User: Mise à jour statut → `past_due`
- Notification: Email de relance paiement

---

## 6. Notification Events

### notification.email.requested

Événement interne pour demander l'envoi d'un email.

| Propriété | Valeur |
|-----------|--------|
| **Exchange** | `cyna.notifications` |
| **Routing Key** | `email` |
| **Émetteur** | Tous les services |
| **Consommateurs** | Notification Service |

```typescript
interface EmailRequestedEvent {
  templateId: string;
  to: string;
  locale: 'fr' | 'en';
  data: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
}
```

### Templates d'emails

| Template ID | Trigger | Variables |
|-------------|---------|-----------|
| `welcome` | `user.registered` | `firstName`, `verificationLink` |
| `email_verification` | `user.registered` | `firstName`, `verificationLink` |
| `password_reset` | `password.reset.requested` | `firstName`, `resetLink`, `expiresIn` |
| `order_confirmation` | `order.paid` | `firstName`, `orderNumber`, `items[]`, `total`, `orderLink` |
| `order_shipped` | `order.shipped` | `firstName`, `orderNumber`, `trackingNumber`, `trackingUrl` |
| `order_delivered` | `order.delivered` | `firstName`, `orderNumber` |
| `order_cancelled` | `order.cancelled` | `firstName`, `orderNumber`, `reason` |
| `subscription_welcome` | `subscription.created` | `firstName`, `productName`, `price`, `billingPeriod`, `dashboardLink` |
| `subscription_renewed` | `subscription.renewed` | `firstName`, `productName`, `amount`, `nextRenewalDate` |
| `subscription_cancelled` | `subscription.cancelled` | `firstName`, `productName`, `effectiveDate` |
| `subscription_past_due` | `subscription.past_due` | `firstName`, `productName`, `amountDue`, `updatePaymentLink` |
| `payment_failed` | `payment.failed` | `firstName`, `amount`, `errorMessage`, `retryLink` |
| `refund_confirmation` | `payment.refunded` | `firstName`, `orderNumber`, `amount` |
| `stock_alert` | `stock.low` | `productName`, `sku`, `currentStock`, `threshold` |
| `contact_received` | `contact.message.received` | `name`, `email`, `subject` |

---

## 7. Analytics Events

Le service Analytics consomme la plupart des événements via un exchange `fanout` pour construire les métriques et dashboards.

### Événements consommés

```typescript
// src/analytics/analytics.consumer.ts

@RabbitSubscribe({
  exchange: 'cyna.analytics',
  routingKey: '',
  queue: 'analytics.events',
})
async handleAnalyticsEvent(event: BaseEvent) {
  switch (event.eventType) {
    // Auth metrics
    case 'auth.user.registered':
      await this.metrics.incrementRegistrations();
      break;
    case 'auth.user.login':
      await this.metrics.trackLogin(event.data);
      break;
      
    // Sales metrics
    case 'order.order.paid':
      await this.metrics.recordSale(event.data);
      break;
    case 'payment.subscription.created':
      await this.metrics.addMRR(event.data);
      break;
    case 'payment.subscription.cancelled':
      await this.metrics.removeMRR(event.data);
      break;
      
    // Stock metrics
    case 'catalog.stock.confirmed':
      await this.metrics.updateStockMetrics(event.data);
      break;
  }
}
```

---

## 8. Flux complets

### Flux 1: Inscription utilisateur

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │  Auth   │     │ Notif.  │     │Analytics│
│         │     │ Service │     │ Service │     │ Service │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │  POST /register               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ user.registered               │
     │               │──────────────>│               │
     │               │───────────────────────────────>
     │               │               │               │
     │               │               │ Send email    │
     │               │               │──────┐        │
     │               │               │<─────┘        │
     │               │               │               │
     │  201 Created  │               │               │
     │<──────────────│               │               │
```

### Flux 2: Achat produit physique (checkout complet)

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │  Order  │     │ Catalog │     │ Payment │     │ Notif.  │
│         │     │ Service │     │ Service │     │ Service │     │ Service │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ POST /checkout/start          │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │ checkout.started              │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ stock.reserved│               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │ POST /checkout/complete       │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │ order.created │               │               │
     │               │──────────────────────────────>│               │
     │               │               │               │               │
     │ Redirect to Stripe            │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ [User pays on Stripe]         │               │               │
     │               │               │               │               │
     │               │               │ Webhook       │               │
     │               │               │<──────────────│               │
     │               │               │               │               │
     │               │ payment.confirmed             │               │
     │               │<─────────────────────────────│               │
     │               │               │               │               │
     │               │ order.paid    │               │               │
     │               │──────────────>│               │               │
     │               │──────────────────────────────────────────────>│
     │               │               │               │               │
     │               │ stock.confirmed               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │               │               │               │ Send email    │
     │               │               │               │ confirmation  │
```

### Flux 3: Souscription SaaS directe

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │  Order  │     │ Payment │     │  User   │     │ Notif.  │
│         │     │ Service │     │ Service │     │ Service │     │ Service │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ POST /subscribe               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │ subscription.initiated        │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │ Redirect to Stripe            │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ [User pays subscription]      │               │               │
     │               │               │               │               │
     │               │               │ Webhook       │               │
     │               │               │ (subscription.created)        │
     │               │               │               │               │
     │               │ subscription.created          │               │
     │               │<──────────────│               │               │
     │               │               │──────────────>│               │
     │               │               │──────────────────────────────>│
     │               │               │               │               │
     │               │               │               │ Update user   │
     │               │               │               │ subscriptions │
     │               │               │               │               │
     │               │               │               │               │ Send
     │               │               │               │               │ welcome
     │               │               │               │               │ email
```

### Flux 4: Échec de paiement abonnement

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Stripe  │     │ Payment │     │  User   │     │ Notif.  │
│         │     │ Service │     │ Service │     │ Service │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ Webhook       │               │               │
     │ invoice.payment_failed        │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ subscription.past_due         │
     │               │──────────────>│               │
     │               │──────────────────────────────>│
     │               │               │               │
     │               │               │ Update status │
     │               │               │ → past_due    │
     │               │               │               │
     │               │               │               │ Send
     │               │               │               │ payment
     │               │               │               │ reminder
```

---

## 9. Dead Letter Queue

### Configuration DLQ

Les messages qui échouent après 3 tentatives sont routés vers la DLQ correspondante.

```typescript
// Structure d'un message DLQ
interface DeadLetterMessage<T> {
  originalEvent: BaseEvent<T>;
  error: {
    message: string;
    stack?: string;
  };
  retryCount: number;
  failedAt: string;
  originalQueue: string;
  originalRoutingKey: string;
}
```

### Monitoring DLQ

```typescript
// src/common/rabbitmq/dlq.monitor.ts

@Injectable()
export class DLQMonitorService {
  @Cron('*/5 * * * *') // Toutes les 5 minutes
  async checkDLQs() {
    const dlqs = [
      'auth.dlq',
      'catalog.dlq',
      'order.dlq',
      'payment.dlq',
      'user.dlq',
      'notification.dlq',
      'analytics.dlq',
    ];
    
    for (const queue of dlqs) {
      const count = await this.getMessageCount(queue);
      if (count > 0) {
        this.logger.warn(`DLQ ${queue} has ${count} messages`);
        // Alerter les admins si nécessaire
      }
    }
  }
}
```

### Reprocessing DLQ

```typescript
// Endpoint admin pour retraiter les messages DLQ
@Post('admin/dlq/:queue/reprocess')
async reprocessDLQ(@Param('queue') queue: string) {
  // Récupérer les messages de la DLQ
  // Les republier sur l'exchange original
  // Supprimer de la DLQ si succès
}
```

---

## 10. Monitoring

### Métriques RabbitMQ à surveiller

| Métrique | Seuil d'alerte | Action |
|----------|----------------|--------|
| Queue message count | > 1000 | Scale consumers |
| Consumer count | < 1 | Restart service |
| Message rate | > 1000/s | Check performance |
| DLQ message count | > 0 | Investigate errors |
| Unacked messages | > 100 | Check consumer health |

### Health Check

```typescript
// src/common/rabbitmq/health.indicator.ts

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isConnected = this.amqpConnection.isConnected();
    
    if (isConnected) {
      return this.getStatus(key, true);
    }
    
    throw new HealthCheckError(
      'RabbitMQ health check failed',
      this.getStatus(key, false),
    );
  }
}
```

### Logging des événements

```typescript
// Middleware de logging pour tous les événements
@Injectable()
export class EventLoggingInterceptor {
  intercept(event: BaseEvent) {
    this.logger.log({
      eventId: event.eventId,
      eventType: event.eventType,
      source: event.source,
      correlationId: event.correlationId,
      timestamp: event.timestamp,
    });
  }
}
```

---

## 📋 Changelog

### v1.0 (21 janvier 2026)
- Version initiale
- 35+ événements documentés
- Configuration exchanges et queues
- Flux complets illustrés
- Gestion DLQ et retry policy
