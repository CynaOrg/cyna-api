# User Service Extraction — Design Spec

**Date** : 2026-04-23
**Branche** : `feat/user-service`
**Status** : Design approuvé, prêt pour implémentation

---

## 1. Contexte & Problème

L'API CYNA est une architecture microservices NestJS avec communication RabbitMQ. Actuellement, **il n'existe pas de `user-service`** : toute la logique liée à l'entité `User` (profil, préférences, mot de passe, soft delete, admin user management, synchronisation Stripe) vit dans `auth-service`.

**Preuves du couplage indésirable** :

- `cyna-api/apps/auth-service/src/entities/user.entity.ts` déclare l'entité `User` avec tous les champs métier (`firstName`, `lastName`, `companyName`, `vatNumber`, `preferredLanguage`, `stripeCustomerId`) — aucun n'est spécifique à l'authentification.
- `cyna-api/apps/auth-service/src/controllers/auth.controller.ts:79-106` expose 5 `@MessagePattern(MESSAGE_PATTERNS.USER.*)` qui traitent du profil utilisateur, pas de l'auth.
- `cyna-api/apps/auth-service/src/services/auth.service.ts` fait 746 lignes et mélange bcrypt/JWT/refresh tokens avec updateProfile/updateLanguage/deleteAccount.
- `cyna-api/apps/auth-service/src/services/admin-auth.service.ts` contient du user admin management (`admin_get_users`, `admin_update_user_status`) — logique purement user, exposée sous un pattern `AUTH.*`.
- `cyna-api/apps/api-gateway/src/profile/profile.service.ts:18` injecte `SERVICE_NAMES.AUTH` pour envoyer des `MESSAGE_PATTERNS.USER.*` — anomalie évidente (le contrat USER existe mais est servi par le wrong service).

**Ce qui est déjà prêt (bonne surprise)** :

- `libs/common/src/rabbitmq/patterns.ts` déclare déjà `SERVICE_NAMES.USER = 'USER_SERVICE'` et un bloc `MESSAGE_PATTERNS.USER.*`.
- Le module `api-gateway/src/profile/` et `api-gateway/src/users/` (admin) existent déjà côté gateway.
- Le contrat est prêt, seul le service destinataire manque.

**Conclusion** : on termine un refactor laissé à moitié — on extrait le domaine user de auth-service vers un nouveau microservice dédié.

## 2. Objectif

Créer un microservice `user-service` dédié au cycle de vie du compte utilisateur, avec :

- Ownership de l'entité `User` et de la table `users` (lecture/écriture exclusives).
- Exposition de tous les patterns RMQ `USER.*` via sa queue `user_queue`.
- auth-service ne touche **plus jamais** au repository `User` ; il communique par RMQ.
- API Gateway route les endpoints `/profile`, `/admin/users` vers `USER_SERVICE` au lieu de `AUTH_SERVICE`.
- payment-service émet le stripe customer ID sync vers user-service au lieu de auth-service.

**Non-objectif** : créer un `admin-service`. L'entité `Admin` (backoffice employee) + login admin + 2FA admin restent dans auth-service (surface trop faible pour justifier un service dédié aujourd'hui — décision à revoir si l'admin grandit en complexité : rôles, audit log, etc.).

## 3. Choix architectural : logical microservices sur DB partagée

Même pattern que `catalog-service`, `order-service`, `payment-service`, `content-service` : une seule instance PostgreSQL `cyna_db` partagée, chaque service déclare **ses propres entités** dans `TypeOrmModule.forRoot({ entities: [...] })`, aucun service ne lit les tables d'un autre service → toute communication inter-service passe par RabbitMQ.

**Pas de migration de schéma** : la table `users` existe déjà, on déplace juste l'entité TypeORM. user-service pointe sur la même DB sans migration.

**Relations TypeORM cross-service supprimées** : les `OneToMany` de `User` vers `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken` sont retirées. Les 3 tables d'auth gardent juste une colonne `user_id` (UUID) comme référence nue, sans FK TypeORM (cohérent avec la pratique CYNA — pas de FK cross-service logique).

## 4. Découpage des responsabilités

### Ce qui migre vers `user-service`

**Entité** : `User` (déplacée telle quelle depuis `auth-service/src/entities/user.entity.ts`, relations `OneToMany` retirées).

**Patterns RMQ existants à migrer** (queue `user_queue`) :

| Pattern                                                      | Handler cible                           |
| ------------------------------------------------------------ | --------------------------------------- |
| `USER.GET_PROFILE`                                           | `UserController.getProfile`             |
| `USER.UPDATE_PROFILE`                                        | `UserController.updateProfile`          |
| `USER.UPDATE_PASSWORD`                                       | `UserController.updatePassword`         |
| `USER.UPDATE_LANGUAGE`                                       | `UserController.updateLanguage`         |
| `USER.DELETE_ACCOUNT`                                        | `UserController.deleteAccount`          |
| `AUTH.GET_USER_BY_ID` → `USER.GET_BY_ID`                     | `UserController.getById`                |
| `AUTH.ADMIN_GET_USERS` → `USER.ADMIN_LIST`                   | `UserAdminController.adminList`         |
| `AUTH.ADMIN_GET_USER` → `USER.ADMIN_GET`                     | `UserAdminController.adminGet`          |
| `AUTH.ADMIN_UPDATE_USER_STATUS` → `USER.ADMIN_UPDATE_STATUS` | `UserAdminController.adminUpdateStatus` |

**Nouveaux patterns** (créés pour la communication auth → user) :

| Pattern                          | Usage                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `USER.CREATE`                    | auth-service au register : crée un User après hash du password                                                                               |
| `USER.FIND_BY_EMAIL`             | auth-service au login / forgot-password : récupère `{id, email, passwordHash, isActive, isVerified, preferredLanguage, firstName, lastName}` |
| `USER.MARK_VERIFIED`             | auth-service après validation du token d'email (event, fire-and-forget)                                                                      |
| `USER.UPDATE_PASSWORD_HASH`      | auth-service après validation du token de reset password                                                                                     |
| `USER.UPDATE_STRIPE_CUSTOMER_ID` | payment-service après création de customer Stripe (remplace event `auth.update_stripe_customer_id`)                                          |

### Ce qui reste dans `auth-service`

**Entités** : `Admin`, `Admin2FACode`, `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken` (plus aucune relation TypeORM vers User, juste colonne `user_id` UUID).

**Patterns RMQ conservés** : `AUTH.REGISTER_USER`, `AUTH.VALIDATE_USER`, `AUTH.VERIFY_EMAIL`, `AUTH.RESEND_VERIFICATION`, `AUTH.FORGOT_PASSWORD`, `AUTH.RESET_PASSWORD`, `AUTH.REFRESH_TOKEN`, `AUTH.LOGOUT`, + tous les patterns admin auth (login admin, 2FA, refresh).

**Logique conservée** : bcrypt hashing, JWT signing/verif, refresh tokens, email verification tokens, password reset tokens, envoi des events de notification (`auth.user.registered`, etc.).

### Patterns supprimés de `MESSAGE_PATTERNS.AUTH`

- `GET_USER_BY_ID`
- `ADMIN_GET_USERS`
- `ADMIN_GET_USER`
- `ADMIN_UPDATE_USER_STATUS`

## 5. Flux cross-service (auth ↔ user via RMQ)

| Flux                | Chemin                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Register**        | `AUTH.REGISTER_USER` → auth-service hash password → `USER.CREATE` (RMQ) → auth-service reçoit le user créé → crée `EmailVerificationToken` → emit `auth.user.registered` |
| **Login**           | `AUTH.VALIDATE_USER` → auth-service `USER.FIND_BY_EMAIL` (RMQ) → récupère User (avec passwordHash) → bcrypt compare → JWT sign                                           |
| **Verify email**    | `AUTH.VERIFY_EMAIL` → valide token → auth-service émet `USER.MARK_VERIFIED` (event)                                                                                      |
| **Forgot password** | `AUTH.FORGOT_PASSWORD` → `USER.FIND_BY_EMAIL` (RMQ) → crée `PasswordResetToken` → emit event notification                                                                |
| **Reset password**  | `AUTH.RESET_PASSWORD` → valide token → bcrypt hash new password → `USER.UPDATE_PASSWORD_HASH` (RMQ)                                                                      |
| **Stripe sync**     | payment-service émet `USER.UPDATE_STRIPE_CUSTOMER_ID` (remplace ancien event `auth.update_stripe_customer_id`)                                                           |

Tous les `firstValueFrom(client.send(...))` sont wrappés avec `timeout(5000) + retry(2) + catchError` selon le pattern CYNA documenté dans CLAUDE.md.

## 6. Arborescence cible

```
cyna-api/apps/user-service/
├── src/
│   ├── config/
│   │   ├── user.config.ts
│   │   └── index.ts
│   ├── controllers/
│   │   ├── user.controller.ts
│   │   ├── user-admin.controller.ts
│   │   ├── user.controller.spec.ts
│   │   ├── user-admin.controller.spec.ts
│   │   └── index.ts
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   ├── admin-update-status.dto.ts
│   │   ├── index.ts
│   │   └── (re-exports de @cyna-api/common pour UpdateProfile/Password/Language/DeleteAccount)
│   ├── entities/
│   │   ├── user.entity.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── user.service.ts
│   │   ├── user-admin.service.ts
│   │   ├── user.service.spec.ts
│   │   ├── user-admin.service.spec.ts
│   │   └── index.ts
│   ├── user.module.ts
│   └── main.ts
├── Dockerfile
└── tsconfig.app.json
```

**Infrastructure locale** :

- `docker-compose.yml` : nouveau service `user-service` (copie de `auth-service`, port 3005 comme documenté dans CLAUDE.md)
- `nest-cli.json` : nouvelle entrée pour le projet user-service
- `package.json` : script `start:user-service`

**Configuration** :

- Queue RMQ : `user_queue` (durable: true)
- Pas de `ClientsModule` dans user-service pour ce refactor (aucune dépendance sortante vers un autre service).

## 7. Modifications collatérales

### API Gateway

- `api-gateway/src/app.module.ts` : ajouter `USER_SERVICE` dans `ClientsModule.register` avec queue `user_queue`
- `api-gateway/src/profile/profile.service.ts:18` : `@Inject(SERVICE_NAMES.AUTH)` → `@Inject(SERVICE_NAMES.USER)`
- `api-gateway/src/users/user-admin.controller.ts` et son service associé : idem

### payment-service

- Remplacer l'émission de `auth.update_stripe_customer_id` par `USER.UPDATE_STRIPE_CUSTOMER_ID`
- Ajouter `USER_SERVICE` dans `ClientsModule.register`

### auth-service

- Retrait de `User` des entités TypeORM
- Retrait de `userRepository` de `AuthService` et `AdminAuthService`
- Ajout de `@Inject(SERVICE_NAMES.USER) userClient: ClientProxy`
- Refactor de `register/validateUser/verifyEmail/forgotPassword/resetPassword` pour utiliser `userClient`
- Suppression des méthodes `getProfile/updateProfile/updatePassword/updateLanguage/deleteAccount/updateStripeCustomerId/findUserById` de `AuthService`
- Suppression des `@MessagePattern(MESSAGE_PATTERNS.USER.*)` de `auth.controller.ts`
- Suppression des `@EventPattern('auth.update_stripe_customer_id')`
- Suppression des méthodes admin user management de `AdminAuthService`
- Retrait des relations `@ManyToOne(() => User)` dans `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken` → remplacées par `@Column userId: string`

## 8. Phases d'implémentation

Orchestration par Claude avec la team d'agents : `nestjs-microservices` (architecte/implémentation), `code-reviewer` (review après chaque commit), `security-auditor` (audit OWASP phase 8), `test-writer` (phase 7), `verify-app` (vérification finale).

| Phase | Livrable                                                                        | Agent principal      | Review                           |
| ----- | ------------------------------------------------------------------------------- | -------------------- | -------------------------------- |
| 0     | Spec doc committé sur la branche                                                | —                    | toi                              |
| 1     | Scaffolding user-service (main.ts, module, docker-compose, nest-cli.json)       | nestjs-microservices | code-reviewer                    |
| 2     | Patterns RMQ mis à jour + User entity déplacée + OneToMany retirés              | nestjs-microservices | code-reviewer                    |
| 3     | UserService + UserController (profile, credentials lookup, mark verified, etc.) | nestjs-microservices | code-reviewer + security-auditor |
| 4     | UserAdminService + UserAdminController (list/get/update-status)                 | nestjs-microservices | code-reviewer + security-auditor |
| 5     | Refactor auth-service → appels RMQ vers user-service                            | nestjs-microservices | code-reviewer + security-auditor |
| 6     | Refactor api-gateway + payment-service (switch d'injection)                     | nestjs-microservices | code-reviewer                    |
| 7     | Tests unitaires user-service + update specs auth-service                        | test-writer          | verify-app                       |
| 8     | Audit sécurité OWASP final                                                      | security-auditor     | —                                |
| 9     | PR + CI + squash merge                                                          | —                    | toi                              |

**Commits avant squash** (8 commits planifiés) :

1. `docs(user-service): add extraction design spec`
2. `feat(user-service): scaffold new user microservice`
3. `refactor(user-service): move User entity and relocate TypeORM mapping`
4. `feat(user-service): implement profile and credentials handlers`
5. `feat(user-service): implement admin user management handlers`
6. `refactor(auth-service): delegate user domain to user-service via RMQ`
7. `refactor(gateway,payment): route user patterns to user-service`
8. `test(user-service): add unit tests for user and admin handlers`

(+ éventuel `fix(security): address audit findings` si phase 8 remonte des findings)

Squash final → 1 seul commit sur main : `feat(user-service): extract user domain from auth into dedicated microservice`.

## 9. Déploiement Railway

### Phase R1 — Création du service

Dès la phase 1 (code scaffolding), créer le service sur Railway en env `production` :

```bash
cd cyna-api
railway add --service user-service --environment production
```

### Phase R2 — Variables d'environnement

Utilisation de **Railway variable references** pour éviter la duplication :

| Variable                  | Valeur                       |
| ------------------------- | ---------------------------- |
| `DATABASE_HOST`           | `${{Postgres.PGHOST}}`       |
| `DATABASE_PORT`           | `${{Postgres.PGPORT}}`       |
| `DATABASE_USER`           | `${{Postgres.PGUSER}}`       |
| `DATABASE_PASSWORD`       | `${{Postgres.PGPASSWORD}}`   |
| `DATABASE_NAME`           | `${{Postgres.PGDATABASE}}`   |
| `DATABASE_SYNC`           | `false`                      |
| `DATABASE_LOGGING`        | `false`                      |
| `DATABASE_MIGRATIONS_RUN` | `false`                      |
| `RABBITMQ_URL`            | `${{rabbitmq.RABBITMQ_URL}}` |
| `NODE_ENV`                | `production`                 |
| `PORT`                    | `3005`                       |

### Phase R3 — Build

Nixpacks par défaut. Configuration :

- Root directory : `cyna-api/`
- Build command : `npm ci && npm run build user-service`
- Start command : `node dist/apps/user-service/main.js`
- Healthcheck : même endpoint que les autres services (à vérifier, `/health` par convention)

S'aligner sur le pattern des autres services (présence éventuelle d'un `railway.toml` ou `nixpacks.toml` à vérifier en phase 1).

### Phase R4 — Déploiement staging (avant merge)

1. Push `feat/user-service` → Railway deploy le service
2. `railway logs --service user-service` → vérifier `Microservice listening on queue user_queue`
3. Healthcheck vert
4. Le service tourne "en satellite" (aucun caller n'utilise encore les USER.\* en prod tant que le merge n'est pas fait)

### Phase R5 — Redéploiement post-merge

Après squash merge sur `main`, auth-service + api-gateway + payment-service redéploient automatiquement. Ordre idéal pour minimiser downtime :

```bash
# user-service est déjà UP depuis phase R4
railway service redeploy --service auth-service --environment production
railway service redeploy --service api-gateway --environment production
railway service redeploy --service payment-service --environment production
```

### Phase R6 — Vérification post-déploiement

Smoke tests curl (section 10) contre l'URL prod. Critères OK : 18 tests passent, aucune erreur dans les logs pendant 5 min.

### Rollback

```bash
railway down --service api-gateway --environment production
railway down --service auth-service --environment production
railway down --service payment-service --environment production
```

user-service peut rester déployé (dormant, sans caller).

## 10. Smoke tests curl

Batterie de 18 tests à exécuter en local puis en prod Railway après déploiement.

### Endpoints user (via user-service)

1. `GET /api/v1/profile` → 200 + profil
2. `PATCH /api/v1/profile` → 200 + modif persistée
3. `PATCH /api/v1/profile/language` → 200
4. `POST /api/v1/profile/password` → 200 + login new pwd OK
5. `POST /api/v1/profile/delete` → 200 + `isActive=false`

### Endpoints auth (cross-service via RMQ)

6. `POST /api/v1/auth/register` → 200 + user créé par user-service + email envoyé
7. `POST /api/v1/auth/login` → 200 + JWT
8. `GET /api/v1/auth/verify-email?token=...` → 200 + `isVerified=true`
9. `POST /api/v1/auth/forgot-password` → 200 + email
10. `POST /api/v1/auth/reset-password` → 200 + login OK
11. `POST /api/v1/auth/refresh` → 200
12. `POST /api/v1/auth/logout` → 200

### Endpoints admin user management

13. `GET /api/v1/admin/users` → 200 + liste paginée
14. `GET /api/v1/admin/users/:id` → 200
15. `PATCH /api/v1/admin/users/:id/status` → 200

### Cross-service payment ↔ user

16. Créer checkout Stripe pour user sans `stripeCustomerId` → `user.stripe_customer_id` renseigné après webhook

### Non-régression admin auth

17. `POST /api/v1/admin/auth/login` → 200 + flow 2FA
18. `POST /api/v1/admin/auth/verify-2fa` → 200 + JWT admin

### Critères d'acceptation globaux

- 18 tests passent local + prod
- `npm run test` passe sur tous les services touchés
- Couverture user-service ≥ 80%
- Zéro erreur RMQ dans logs Railway pendant 5 min post-deploy
- Rapport security-auditor : aucun finding HIGH/CRITICAL
- Rapport code-reviewer : aucun blocker

## 11. Risques & mitigation

| #   | Risque                                     | Mitigation                                                                                                                           |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Régression login (RMQ critique)            | user-service déployé avant merge (R4) + timeout(5000)+retry(2)+catchError sur tous les appels + rollback prêt                        |
| R2  | Hash password sur RMQ                      | RabbitMQ interne Railway (privé) + bcrypt cost 12 + jamais logger le payload + alternative `USER.VERIFY_CREDENTIALS` si audit alerte |
| R3  | Deadlock au démarrage                      | NestJS RMQ ne "wait for peer" pas ; messages queued par RabbitMQ ; pas de deadlock possible                                          |
| R4  | Migration / seeds en conflit               | Pas de migration schéma dans ce refactor ; `DATABASE_MIGRATIONS_RUN=false` côté user-service ; seeds auditées                        |
| R5  | Callers oubliés des anciens patterns admin | Grep exhaustif sur tout le monorepo + cyna-backoffice + cyna-app avant phase 5                                                       |
| R6  | JWT / cookies / session cassés             | JWT signature et payload inchangés ; DTOs de réponse strictement identiques ; diff avant/après                                       |
| R7  | Tests auth cassés en bloc                  | Phase 7 dédiée (test-writer) ; pattern mock ClientProxy déjà utilisé dans le repo                                                    |
| R8  | Coût Railway +5$/mois                      | Acceptable pour propreté archi projet académique                                                                                     |
| R9  | Dev local cassé                            | docker-compose.yml mis à jour en phase 1 + note dans la PR                                                                           |

## 12. Team d'agents & orchestration

| Agent                  | Rôle                                                          | Quand                            |
| ---------------------- | ------------------------------------------------------------- | -------------------------------- |
| `nestjs-microservices` | Architecte backend, implémentation                            | Phases 1-6                       |
| `code-reviewer`        | Revue cleanliness, types stricts, conventions CYNA            | Après chaque phase code          |
| `security-auditor`     | Audit OWASP, password handling, authz admin, log sanitization | Phase 8 + spot-checks phases 3-5 |
| `test-writer`          | Génération/maintenance tests unitaires                        | Phase 7                          |
| `verify-app`           | Lancement test suite + smoke tests curl                       | Phase 7-R6                       |

Claude orchestre en série (pas de parallélisation sauvage) pour que chaque agent ait le contexte à jour. La branche `feat/user-service` est isolée ; le squash merge final consolide en 1 commit sur `main`.
