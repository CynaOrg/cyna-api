# API Gateway

Seul point d'entrée HTTP du backend. Toutes les requêtes externes (cyna-app, cyna-backoffice, webhooks Stripe) arrivent ici et sont dispatchées vers les microservices via RabbitMQ.

## Rôle

- Routing REST → `MessagePattern` vers le bon microservice
- Authentification : JWT guards (user + admin), refresh via cookie httpOnly
- Rate limiting (`@nestjs/throttler`)
- Validation des DTOs (`class-validator`)
- Swagger (`/docs`) en dev / staging
- CORS + cookies sécurisés

## Endpoints principaux

| Préfixe                                         | Description                                        |
| ----------------------------------------------- | -------------------------------------------------- |
| `/api/v1/auth/*`                                | Register, login, refresh, 2FA, reset password      |
| `/api/v1/admin/auth/*`                          | Login admin (2FA obligatoire), refresh admin       |
| `/api/v1/users/*`                               | Profil, adresses                                   |
| `/api/v1/admin/users/*`                         | Gestion users côté back-office                     |
| `/api/v1/catalog/*`                             | Produits, catégories (public + admin)              |
| `/api/v1/cart/*`, `/api/v1/orders/*`            | Panier et commandes                                |
| `/api/v1/payment/*`                             | Création PaymentIntent Stripe                      |
| `/api/v1/subscriptions/*`, `/api/v1/licenses/*` | Abonnements et licences                            |
| `/api/v1/webhooks/stripe`                       | Réception des webhooks Stripe (signature vérifiée) |
| `/api/v1/content/*`                             | Carrousel homepage, FAQ, contact                   |
| `/api/v1/analytics/*`                           | KPIs back-office                                   |

## Démarrage isolé

```bash
npm run start:dev:gateway
```

Le gateway a besoin de RabbitMQ démarré pour pouvoir parler aux autres services (`npm run start:infra` à la racine).

## Port

- HTTP : `3000` (configurable via `APP_PORT`)
