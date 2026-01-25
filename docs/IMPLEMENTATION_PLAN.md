# CYNA — Plan d'Implémentation Claude Code
## Fondations du Projet (NestJS 11 + RabbitMQ)

> **Version:** 1.3  
> **Date:** 21 janvier 2026  
> **Auteur:** Tom (Deputy PM / Backend)  
> **Pour:** Claude Code

---

## ⚠️ IMPORTANT — SCOPE DE CETTE PHASE

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   CETTE PHASE = FONDATIONS UNIQUEMENT                          │
│                                                                 │
│   ✅ ON FAIT :                                                  │
│      • API Gateway (structure vide, pas de routes métier)      │
│      • Bibliothèque @cyna/common partagée                      │
│      • Connexion RabbitMQ + Exchanges + Patterns               │
│      • Swagger, Logger, i18n, Exceptions                       │
│                                                                 │
│   ❌ ON NE FAIT PAS :                                          │
│      • AUCUN microservice (auth, catalog, order, etc.)         │
│      • AUCUNE entité / base de données                         │
│      • AUCUNE logique métier                                   │
│      • AUCUNE authentification                                 │
│      • AUCUN controller métier                                 │
│                                                                 │
│   Les microservices seront créés UN PAR UN dans des phases     │
│   ultérieures avec leurs propres plans d'implémentation.       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Objectif

Créer une **base technique solide** prête à accueillir les microservices :

| ✅ Cette phase | ❌ Phases suivantes |
|----------------|---------------------|
| Monorepo NestJS 11 | Auth Service |
| @nestjs/microservices configuré | Catalog Service |
| RabbitMQ connecté + Exchanges | Order Service |
| Swagger / OpenAPI | Payment Service |
| Logger Winston | User Service |
| i18n FR/EN | Notification Service |
| Exceptions centralisées | Content Service |
| DTOs et Enums partagés | Analytics Service |
| Health check basique | Entités TypeORM |
| | Logique métier |

---

## 📚 Contexte Technique

```yaml
Projet: CYNA - E-commerce B2B Cybersécurité
Framework: NestJS 11
Architecture: Microservices (préparation infrastructure)
Transport: RabbitMQ
Langues: FR (défaut), EN
Gateway Port: 3000
RabbitMQ: 5672 (AMQP) / 15672 (Management)
```

**Documents de référence :**
- `CYNA_Event_Catalog_RabbitMQ_v1_0.md` → Exchanges, Queues, Events
- `CYNA_API_Endpoints_Map_v1_0.md` → Format réponses, codes erreur
- `CYNA_Data_Model_v1_4.md` → Enums
- `CYNA_DTOs_Validation_Rules_v1_0.md` → Validation i18n

---

## 🏗️ Phase 1 : Initialisation Monorepo

### 1.1 — Création du projet

```
Créer un monorepo NestJS 11 avec :
- Une seule application : api-gateway
- Une bibliothèque partagée : @cyna/common

NE PAS créer d'autres applications.
Les microservices seront ajoutés plus tard via "nest g app <name>".
```

### 1.2 — Dépendances

```
@nestjs/core@11
@nestjs/common@11
@nestjs/platform-express@11
@nestjs/config
@nestjs/microservices
@nestjs/swagger + swagger-ui-express
amqplib + amqp-connection-manager
class-validator + class-transformer
nestjs-i18n
winston + nest-winston
helmet + compression + cookie-parser
uuid + joi
```

### 1.3 — Structure finale attendue

```
cyna-api/
├── apps/
│   └── api-gateway/                 ← SEULE application créée
│       ├── src/
│       │   ├── main.ts
│       │   ├── gateway.module.ts
│       │   └── health/
│       │       └── health.controller.ts
│       └── tsconfig.app.json
│
├── libs/
│   └── common/                      ← Bibliothèque partagée
│       └── src/
│           ├── config/
│           ├── logger/
│           ├── i18n/
│           ├── exceptions/
│           ├── filters/
│           ├── interceptors/
│           ├── decorators/
│           ├── dto/
│           ├── enums/
│           ├── rabbitmq/
│           └── index.ts
│
├── docker-compose.yml               ← RabbitMQ uniquement
├── nest-cli.json
├── package.json
├── tsconfig.json
├── .env.example
└── .env.development

⚠️ PAS de dossier apps/auth-service/
⚠️ PAS de dossier apps/catalog-service/
⚠️ PAS de dossier apps/order-service/
⚠️ etc.
```

---

## 🐰 Phase 2 : Configuration RabbitMQ

### 2.1 — Docker Compose

```
Créer docker-compose.yml avec RabbitMQ uniquement :
- Image : rabbitmq:3-management
- Ports : 5672, 15672
- Credentials dev : guest/guest

⚠️ PAS de PostgreSQL
⚠️ PAS de Redis
```

### 2.2 — Variables d'environnement

```
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE_EVENTS=cyna.events
RABBITMQ_EXCHANGE_DIRECT=cyna.direct
RABBITMQ_EXCHANGE_DLX=cyna.dlx
```

### 2.3 — Exchanges à déclarer

```
Référencer CYNA_Event_Catalog_RabbitMQ_v1_0.md.

Créer les exchanges au démarrage du Gateway :
1. cyna.direct (direct) - Request/Response
2. cyna.events (topic) - Events asynchrones  
3. cyna.notifications (direct) - Notifications
4. cyna.analytics (fanout) - Analytics
5. cyna.dlx (topic) - Dead Letter

⚠️ NE PAS créer les queues des microservices.
   Chaque microservice créera sa queue au démarrage.
```

### 2.4 — Patterns à définir

```
Créer libs/common/src/rabbitmq/patterns.ts avec :

1. SERVICE_NAMES (constantes) :
   - AUTH_SERVICE = 'AUTH_SERVICE'
   - CATALOG_SERVICE = 'CATALOG_SERVICE'
   - ORDER_SERVICE = 'ORDER_SERVICE'
   - etc.

2. MESSAGE_PATTERNS (pour @MessagePattern) :
   - Définir les patterns de commandes
   - Ex: { cmd: 'auth.login' }, { cmd: 'catalog.getProduct' }

3. EVENT_PATTERNS (pour @EventPattern) :
   - Reprendre TOUS les events de CYNA_Event_Catalog_RabbitMQ_v1_0.md
   - Ex: 'user.registered', 'order.created', 'payment.confirmed'

Ces patterns seront utilisés par les microservices futurs.
Pour l'instant, ils sont juste DÉFINIS, pas UTILISÉS.
```

### 2.5 — Module RabbitMQ

```
Créer libs/common/src/rabbitmq/rabbitmq.module.ts :

- Se connecte à RabbitMQ
- Déclare les exchanges
- Expose un service pour vérifier la connexion (health check)
- Expose une factory pour créer des ClientProxy

⚠️ NE PAS enregistrer de ClientProxy vers les microservices.
   Les microservices n'existent pas encore !
```

---

## ⚙️ Phase 3 : Configuration Centralisée

### 3.1 — Structure

```
libs/common/src/config/
├── config.module.ts
├── configuration.ts
├── env.validation.ts
└── index.ts
```

### 3.2 — Variables d'environnement

```
# Application
NODE_ENV=development
APP_NAME=cyna-api
APP_PORT=3000

# API
API_PREFIX=api
API_VERSION=v1

# Swagger
SWAGGER_ENABLED=true
SWAGGER_PATH=docs

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty

# i18n
DEFAULT_LANGUAGE=fr
FALLBACK_LANGUAGE=fr

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# CORS
CORS_ORIGINS=http://localhost:4200,http://localhost:8100
```

---

## 📝 Phase 4 : Logger

### 4.1 — Structure

```
libs/common/src/logger/
├── logger.module.ts
├── logger.service.ts
├── logger.config.ts
└── index.ts
```

### 4.2 — Méthodes LoggerService

```
Standard :
- log(), error(), warn(), debug()

HTTP :
- logHttpRequest(method, url, statusCode, duration)

RabbitMQ (préparation) :
- logMessageSent(pattern, correlationId)
- logMessageReceived(pattern, correlationId)
- logEventPublished(event, routingKey)
- logEventConsumed(event, source)

Business (préparation) :
- logBusinessAction(action, entityType, entityId)
```

### 4.3 — Correlation ID

```
Implémenter un système de Correlation ID :
- Généré à chaque requête HTTP
- Propagé dans les logs
- Prévu pour être passé aux microservices (plus tard)
```

---

## 🌍 Phase 5 : i18n

### 5.1 — Structure

```
libs/common/src/i18n/
├── i18n.module.ts
├── locales/
│   ├── fr/
│   │   ├── common.json
│   │   ├── validation.json
│   │   └── errors.json
│   └── en/
│       ├── common.json
│       ├── validation.json
│       └── errors.json
└── index.ts
```

### 5.2 — Contenu des traductions

```
Référencer :
- CYNA_DTOs_Validation_Rules_v1_0.md → validation.json
- CYNA_API_Endpoints_Map_v1_0.md (section 10) → errors.json

validation.json : password.*, email.*, string.*, number.*, etc.
errors.json : http.*, auth.*, user.*, catalog.*, order.*, payment.*
```

---

## 🚨 Phase 6 : Exceptions

### 6.1 — Structure

```
libs/common/src/exceptions/
├── base.exception.ts
├── business/
│   ├── auth.exceptions.ts
│   ├── user.exceptions.ts
│   ├── catalog.exceptions.ts
│   ├── order.exceptions.ts
│   └── payment.exceptions.ts
├── error-codes.ts
└── index.ts
```

### 6.2 — Classe BaseException

```
Chaque exception contient :
- code: string (ex: "AUTH_INVALID_CREDENTIALS")
- messageKey: string (clé i18n)
- httpStatus: number

Prévoir la compatibilité RpcException pour plus tard.
```

### 6.3 — Filter global

```
libs/common/src/filters/
├── http-exception.filter.ts
└── index.ts

Le filter :
1. Catch toutes les exceptions
2. Traduit via i18n
3. Log via LoggerService
4. Retourne le format standard (voir API Endpoints Map)
```

---

## 🔌 Phase 7 : Intercepteurs & Décorateurs

### 7.1 — Intercepteurs

```
libs/common/src/interceptors/
├── logging.interceptor.ts
├── transform.interceptor.ts
├── correlation-id.interceptor.ts
└── index.ts
```

### 7.2 — Décorateurs

```
libs/common/src/decorators/
├── public.decorator.ts
├── current-lang.decorator.ts
├── correlation-id.decorator.ts
└── index.ts
```

---

## 📦 Phase 8 : DTOs & Enums

### 8.1 — DTOs partagés

```
libs/common/src/dto/
├── pagination.dto.ts
├── api-response.dto.ts
└── index.ts
```

### 8.2 — Enums

```
libs/common/src/enums/

Copier depuis CYNA_Data_Model_v1_4.md :
├── product-type.enum.ts
├── billing-period.enum.ts
├── order-status.enum.ts
├── order-type.enum.ts
├── subscription-status.enum.ts
├── admin-role.enum.ts
├── language.enum.ts
└── index.ts
```

---

## 🚀 Phase 9 : API Gateway

### 9.1 — main.ts

```
1. Créer l'app NestJS
2. Appliquer middlewares (helmet, compression, cookieParser)
3. Configurer ValidationPipe
4. Configurer Swagger
5. Appliquer GlobalExceptionFilter
6. Appliquer Intercepteurs
7. Configurer CORS
8. Définir prefix /api/v1
9. Démarrer sur port 3000

⚠️ PAS de connexion aux microservices (ils n'existent pas)
⚠️ PAS de routes métier
```

### 9.2 — gateway.module.ts

```
Imports :
- ConfigModule
- LoggerModule
- I18nModule
- RabbitMQModule (connexion uniquement)
- HealthModule

⚠️ PAS de ClientsModule vers les microservices
⚠️ PAS de controllers métier
```

### 9.3 — Health Check

```
GET /health

{
  "status": "ok",
  "timestamp": "...",
  "service": "api-gateway",
  "version": "1.0.0",
  "rabbitmq": "connected"
}

⚠️ PAS de vérification des microservices (ils n'existent pas)
```

### 9.4 — Swagger

```
- Titre : CYNA API
- Path : /docs
- Version : 1.0.0

⚠️ Swagger sera vide (pas de routes métier)
   Il servira à documenter les routes quand elles seront créées.
```

---

## ✅ Checklist Finale

### Ce qui DOIT être fait
- [ ] Monorepo avec apps/api-gateway uniquement
- [ ] libs/common avec tous les modules
- [ ] docker-compose.yml avec RabbitMQ
- [ ] Connexion RabbitMQ fonctionnelle
- [ ] Exchanges déclarés
- [ ] Patterns définis (pas utilisés)
- [ ] Logger Winston fonctionnel
- [ ] i18n FR/EN complet
- [ ] Exceptions métier créées
- [ ] Filter global actif
- [ ] Swagger accessible (vide)
- [ ] Health check avec status RabbitMQ

### Ce qui NE DOIT PAS être fait
- [ ] ~~Créer auth-service~~
- [ ] ~~Créer catalog-service~~
- [ ] ~~Créer order-service~~
- [ ] ~~Créer payment-service~~
- [ ] ~~Créer user-service~~
- [ ] ~~Créer notification-service~~
- [ ] ~~Créer content-service~~
- [ ] ~~Créer analytics-service~~
- [ ] ~~Créer des entités TypeORM~~
- [ ] ~~Connecter PostgreSQL~~
- [ ] ~~Connecter Redis~~
- [ ] ~~Implémenter l'authentification~~
- [ ] ~~Créer des routes métier~~

---

## 📎 Validation

```bash
# 1. Démarrer RabbitMQ
docker-compose up -d

# 2. Vérifier RabbitMQ UI
open http://localhost:15672  # guest/guest
# → Les exchanges cyna.* doivent être visibles

# 3. Démarrer le Gateway
npm run start:dev api-gateway

# 4. Vérifier le health
curl http://localhost:3000/health
# → Doit retourner status "ok" avec rabbitmq "connected"

# 5. Vérifier Swagger
open http://localhost:3000/docs
# → Page Swagger visible (vide, c'est normal)

# 6. Tester une erreur 404 (i18n)
curl -H "Accept-Language: fr" http://localhost:3000/api/v1/test
curl -H "Accept-Language: en" http://localhost:3000/api/v1/test
# → Doit retourner une erreur traduite
```

---

## 🔜 Étapes suivantes (HORS SCOPE)

Une fois cette base validée, les microservices seront créés **un par un** :

```
Phase 2 : nest g app auth-service
Phase 3 : nest g app catalog-service
Phase 4 : nest g app order-service
...
```

Chaque microservice aura son propre plan d'implémentation.
