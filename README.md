# CYNA — API (NestJS microservices)

Plateforme e-commerce B2B cybersécurité — backend NestJS 11 (microservices RabbitMQ + Postgres + Redis).

## Stack

| Composant  | Version | Rôle                     |
| ---------- | ------- | ------------------------ |
| Node.js    | 22      | runtime                  |
| NestJS     | 11      | framework                |
| PostgreSQL | 16      | source de vérité         |
| Redis      | 7       | cache + sessions         |
| RabbitMQ   | 3       | transport inter-services |
| Stripe SDK | 20.x    | paiements                |

## Architecture

9 services NestJS sur un seul monorepo Nest. Le gateway (port `3000`) parle aux 8 autres via RabbitMQ.

| Service              | Port HTTP | Queue RMQ            |
| -------------------- | --------- | -------------------- |
| api-gateway          | 3000      | —                    |
| auth-service         | 3001      | `auth.queue`         |
| catalog-service      | 3002      | `catalog.queue`      |
| order-service        | 3003      | `order.queue`        |
| payment-service      | 3004      | `payment.queue`      |
| user-service         | 3005      | `user.queue`         |
| notification-service | 3006      | `notification.queue` |
| content-service      | 3007      | `content.queue`      |
| analytics-service    | 3008      | `analytics.queue`    |

Chaque service expose `/health` (HTTP) en plus de sa queue RMQ.

## Démarrage rapide

```bash
git clone https://github.com/CynaOrg/cyna-api.git
cd cyna-api

# 1. Installer
npm install
cp .env.example .env

# 2. Lancer l'infra (Postgres + Redis + RabbitMQ via Docker)
npm run start:infra

# 3. Lancer les 9 microservices (un seul terminal, multi-couleurs)
npm run start:dev:all

# 4. Quand tout est up, dans un autre terminal — seed des données de démo
npm run seed:dev
```

Après le seed, la base contient :

- **3 catégories** (Services, Produits, Licences)
- **11 produits** avec caractéristiques FR/EN et image
- **3 comptes** prêts à utiliser :

| Rôle                                      | Email                    | Mot de passe     |
| ----------------------------------------- | ------------------------ | ---------------- |
| Super Admin (back-office, 2FA email)      | `super.admin@cyna.local` | `SuperAdmin123!` |
| Commercial Admin (back-office, 2FA email) | `commercial@cyna.local`  | `Commercial123!` |
| Utilisateur (front public)                | `tom.user@cyna.local`    | `User1234!`      |

> ⚠️ Le back-office impose une 2FA par email. En local sans serveur SMTP configuré, le code part dans `apps/notification-service` logs ; cherche `2FA code` dans la console. Sinon utilise un vrai email dans le seed et configure `SMTP_*` dans `.env`.

## Variables d'env importantes

| Variable                      | Défaut                              | À quoi ça sert                                                                                                                                                  |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_*`                  | localhost:5433                      | Postgres (le docker-compose expose 5433 pour ne pas entrer en conflit avec un Postgres système)                                                                 |
| `RABBITMQ_URL`                | `amqp://guest:guest@localhost:5672` | Transport                                                                                                                                                       |
| `JWT_SECRET`                  | —                                   | **Obligatoire**, 32 chars min                                                                                                                                   |
| `STRIPE_SECRET_KEY`           | `sk_test_replace-me`                | Clé Stripe (test ou live)                                                                                                                                       |
| `STRIPE_WEBHOOK_SECRET`       | `whsec_replace-me`                  | Signature webhook                                                                                                                                               |
| `LOCAL_AUTO_CONFIRM_PAYMENTS` | `true` (en local)                   | Marque automatiquement les commandes comme `paid` 3s après création, sans avoir besoin de `stripe listen`. **Désactivé** en production (`NODE_ENV=production`). |
| `ADMIN_SEED_ENABLED`          | `false`                             | Active le seed d'un super-admin via env au démarrage (la vraie méthode est `npm run seed:dev`)                                                                  |

## Tests

```bash
npm run lint           # ESLint
npm test               # Jest unit (1255 tests)
npm run test:cov       # Avec couverture
npm run test:e2e       # Jest e2e (16 suites, nécessite Postgres + RabbitMQ)
```

## Build production

```bash
npm run build
# Lance un service spécifique
node dist/apps/api-gateway/main
```

## Déploiement Railway

Chaque service est un service Railway distinct lié au même repo, build via Railpack (auto-détection Node + `nest build <service>`), avec sa propre commande de start `node dist/apps/<service>/main`. Voir [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md).

## Dépannage

| Symptôme                                              | Solution                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `EADDRINUSE` au démarrage                             | Un service tourne déjà : `lsof -ti:3000 \| xargs kill`                                                                   |
| Commande passe mais reste invisible dans le dashboard | Vérifie que `LOCAL_AUTO_CONFIRM_PAYMENTS=true` dans `.env` — sinon il faut un `stripe listen` actif                      |
| `psql: error database "cyna_db" does not exist`       | Lance `npm run start:infra` puis attends 10s que Postgres soit ready                                                     |
| Code 2FA admin perdu                                  | Récupère-le avec : `psql ... -c "SELECT code FROM admin_2fa_codes WHERE admin_id=<id> ORDER BY created_at DESC LIMIT 1"` |
