# CYNA — API

Backend de la plateforme CYNA (e-commerce B2B cybersécurité). Architecture microservices NestJS, communication RabbitMQ, persistence PostgreSQL + Redis.

## Stack

- NestJS 11 (`@nestjs/microservices`, transport RMQ)
- PostgreSQL 16, Redis 7, RabbitMQ 3
- TypeORM, Stripe, Cloudflare R2 (assets)
- Node.js 20+, Docker, Docker Compose

## Architecture

Un seul HTTP entrypoint (l'API Gateway sur `:3000`). Tous les autres services sont des microservices NestJS qui consomment leur propre queue RabbitMQ et ne sont jamais accessibles directement en HTTP.

| Service                | Queue RMQ             | Rôle                                               |
| ---------------------- | --------------------- | -------------------------------------------------- |
| `api-gateway`          | — (HTTP `:3000`)      | Routing REST, auth guards, rate limiting, Swagger  |
| `auth-service`         | `auth_queue`          | JWT, 2FA admin, register / login / refresh / reset |
| `user-service`         | `user_queue`          | Profils, adresses, admin users                     |
| `catalog-service`      | `catalog_queue`       | Produits, catégories, stock, recherche             |
| `order-service`        | `order_queue`         | Panier, commandes, crons de cleanup                |
| `payment-service`      | `payment_queue`       | Stripe (one-shot + subscriptions), licences        |
| `notification-service` | `notification.emails` | Envoi d'emails (Handlebars + Nodemailer)           |
| `content-service`      | `content_queue`       | Carrousel, FAQ, hero text, messages de contact     |
| `analytics-service`    | `analytics_queue`     | KPIs dashboard back-office, exports CSV            |

## Lancement en local

Prérequis : **Node 20+**, **Docker** (pour Postgres / Redis / RabbitMQ).

```bash
# 1. Cloner et installer
git clone https://github.com/CynaOrg/cyna-api.git
cd cyna-api
npm install

# 2. Variables d'environnement
cp .env.example .env
# Les valeurs par défaut marchent en local (Postgres sur 5433, Redis sur 6379,
# RabbitMQ sur 5672). Renseigner Stripe et SMTP si tu veux tester paiement /
# emails — sinon les services tournent quand même.

# 3. Tout démarrer (infra Docker + les 9 microservices)
npm run start:all
```

Une fois démarré :

- API HTTP : `http://localhost:3000/api/v1`
- Swagger : `http://localhost:3000/docs`
- RabbitMQ Management : `http://localhost:15672` (guest / guest)

### Scripts utiles

```bash
npm run start:infra          # Docker only (rabbitmq + postgres + redis)
npm run start:dev:all        # Les 9 microservices en parallèle (sans Docker)
npm run start:dev:<service>  # Un seul microservice (ex: start:dev:gateway)
npm run stop:infra           # Arrête les conteneurs Docker
npm test                     # Tests unitaires Jest
npm run lint                 # ESLint
```

## Structure

```
apps/
  api-gateway/         # HTTP, port 3000
  auth-service/        # auth_queue
  user-service/        # user_queue
  catalog-service/     # catalog_queue
  order-service/       # order_queue
  payment-service/     # payment_queue
  notification-service/# notification.emails
  content-service/     # content_queue
  analytics-service/   # analytics_queue
libs/common/           # Code partagé (DTOs, contrats RMQ, cache, logger, health)
docker-compose.yml     # Postgres + Redis + RabbitMQ
.env.example           # Toutes les vars à renseigner
```

Chaque microservice a son propre README dans `apps/<service>/README.md`.
