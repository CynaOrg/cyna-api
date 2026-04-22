# Design — Feature "Mes licences" end-to-end

> **Date** : 2026-04-22
> **Auteur** : Claude (Opus 4.7 1M) + Iliès Mahoudeau
> **Scope** : Option B — minimale + révocation auto sur suppression de compte
> **Repos concernés** : `cyna-api`, `cyna-app`

---

## 1. Contexte & problème

La page `/dashboard/licenses` (cyna-app) affiche des **clés de licence factices** générées côté client à partir du numéro de commande :

```typescript
licenseKey: `CYNA-${order.id.substring(0, 4).toUpperCase()}-XXXX-XXXX-XXXX`;
```

Le backend possède pourtant l'infrastructure pour stocker et gérer des vraies clés :

- Entité `LicenseKey` avec `licenseKey`, `status`, `orderId`, `userId`, `email`, `activatedAt`, `expiresAt`
- Service `LicenseService` avec `findByUserId`, `findByOrderId`, `findByEmail`, `generateKey`, `generateForOrder`, `revokeByOrderId`

**Ce qui manque** :

1. Aucun `MessagePattern` RabbitMQ exposant les licences aux autres services
2. Aucun endpoint HTTP dans l'api-gateway
3. Aucun service Angular pour consommer ces endpoints
4. L'entité `LicenseKey` ne snapshotte pas le nom du produit (uniquement `productId` UUID)
5. Aucun listener pour l'event `AUTH.ACCOUNT_DELETED` côté licences (pourtant géré pour les subscriptions)

**Observation hors scope** : `LicenseService.generateForOrder` n'est jamais appelé en production (le `WebhookService` l'injecte mais ne l'invoque pas). La feature sera donc câblée mais la table restera vide tant que le wiring webhook n'est pas fait (suivi dans une tâche séparée).

## 2. Objectifs

- Exposer au client authentifié la liste de ses licences via `GET /api/v1/licenses`
- Exposer le détail d'une licence via `GET /api/v1/licenses/:id` (ownership check)
- Révoquer automatiquement toutes les licences actives d'un user lors de la suppression de son compte (event-driven)
- Afficher les vraies clés sur la page `/dashboard/licenses` avec support i18n (FR/EN) du nom produit
- Zéro appel cross-service runtime (pattern snapshot)

## 3. Architecture & flux de données

```
[Client Angular] (cyna-app)
  GET /api/v1/licenses  (cookie JWT)
     │
     ▼
[API Gateway] (cyna-api, port 3000)
  ├─ @UseGuards(JwtAuthGuard) extrait req.user.id
  ├─ LicenseController.getMyLicenses(req)
  └─ ClientProxy.send(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES, { userId })
     │
     ▼  (RabbitMQ payment_queue)
[Payment Service] (cyna-api)
  ├─ @MessagePattern(GET_USER_LICENSES) PaymentController.getUserLicenses
  └─ LicenseService.findByUserId(userId)
     │
     ▼  (PostgreSQL)
  license_keys  (avec nouvelle colonne product_snapshot jsonb)

Retour : LicenseKey[] avec productSnapshot { nameFr, nameEn, slug }

[Révocation RGPD]
  @EventPattern(EVENT_PATTERNS.AUTH.ACCOUNT_DELETED)
  PaymentController.handleAccountDeleted (étendu)
  → subscriptionService.cancelAllForCustomer (existant)
  → licenseService.revokeAllForUser(userId)  (nouveau)
```

**Principes** :

- Pas de cross-service runtime (snapshot i18n au create)
- Pattern cohérent avec `SubscriptionController` (JwtAuthGuard + ClientProxy + rpcToHttpError)
- Snapshot jsonb cohérent avec `OrderItem.productSnapshot`
- Résolution du nom côté client pour switch de langue sans re-fetch

## 4. Backend — cyna-api

### 4.1 Lib partagée `@cyna-api/common`

**`libs/common/src/rabbitmq/patterns.ts`** — ajouter sous `MESSAGE_PATTERNS.PAYMENT` :

```typescript
GET_USER_LICENSES: { cmd: 'payment.get_user_licenses' },
GET_LICENSE_BY_ID: { cmd: 'payment.get_license_by_id' },
```

Aucun nouveau pattern d'event : réutilisation de `EVENT_PATTERNS.AUTH.ACCOUNT_DELETED`.

### 4.2 Entité `LicenseKey`

**`apps/payment-service/src/entities/license-key.entity.ts`** — nouvelle colonne :

```typescript
export interface ProductSnapshot {
  nameFr: string;
  nameEn: string;
  slug: string;
}

@Column({ name: 'product_snapshot', type: 'jsonb' })
productSnapshot: ProductSnapshot;
```

### 4.3 Migration TypeORM

**`apps/payment-service/src/migrations/<timestamp>-AddProductSnapshotToLicenseKeys.ts`**

- `up()` : `ALTER TABLE license_keys ADD COLUMN product_snapshot jsonb NOT NULL DEFAULT '{"nameFr":"Licence","nameEn":"License","slug":"unknown"}'`
- `down()` : `ALTER TABLE license_keys DROP COLUMN product_snapshot`

Le DEFAULT couvre les lignes existantes (en dev il n'y en a probablement pas vu que `generateForOrder` n'est jamais appelé).

### 4.4 Interface `OrderItemWithProduct` — breaking change

**`apps/payment-service/src/services/license.service.ts`**

Ajout d'un champ requis :

```typescript
export interface OrderItemWithProduct {
  productId: string;
  productType: string;
  quantity: number;
  email: string;
  userId?: string;
  productSnapshot: ProductSnapshot; // nouveau - requis
}
```

Impact : 8 cas de tests existants dans `license.service.spec.ts` doivent être mis à jour pour passer ce champ. Aucun caller de production (`generateForOrder` non wiré).

### 4.5 `LicenseService` — modifications

```typescript
// generateForOrder : persister le snapshot
this.licenseKeyRepository.create({
  orderId,
  productId: item.productId,
  userId: item.userId || null,
  licenseKey: this.generateKey(),
  email: item.email,
  status: LicenseKeyStatus.ACTIVE,
  activatedAt: new Date(),
  productSnapshot: item.productSnapshot,  // nouveau
});

// Nouvelle méthode : ownership-check GET by id
async findByIdForUser(licenseId: string, userId: string): Promise<LicenseKey> {
  const license = await this.licenseKeyRepository.findOne({
    where: { id: licenseId, userId },
  });
  if (!license) throw new NotFoundException('License not found');
  return license;
}

// Nouvelle méthode : révocation en masse pour un user
async revokeAllForUser(userId: string): Promise<number> {
  const result = await this.licenseKeyRepository.update(
    { userId, status: LicenseKeyStatus.ACTIVE },
    { status: LicenseKeyStatus.REVOKED },
  );
  return result.affected ?? 0;
}
```

### 4.6 `PaymentController` — nouveaux handlers

**`apps/payment-service/src/controllers/payment.controller.ts`**

```typescript
@MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES)
async getUserLicenses(@Payload() data: { userId: string }) {
  try { return await this.licenseService.findByUserId(data.userId); }
  catch (error) { throw this.wrapError(error); }
}

@MessagePattern(MESSAGE_PATTERNS.PAYMENT.GET_LICENSE_BY_ID)
async getLicenseById(@Payload() data: { licenseId: string; userId: string }) {
  try { return await this.licenseService.findByIdForUser(data.licenseId, data.userId); }
  catch (error) { throw this.wrapError(error); }
}
```

**Extension du `handleAccountDeleted` existant** — ajouter l'appel à `licenseService.revokeAllForUser(data.userId)` sans dupliquer le handler.

### 4.7 API Gateway — nouveau module `licenses`

```
apps/api-gateway/src/licenses/
  ├── dto/license-response.dto.ts
  ├── license.controller.ts
  └── license.module.ts
```

**`LicenseController`** — calqué strictement sur `SubscriptionController` :

```typescript
@UseGuards(JwtAuthGuard)
@Controller("licenses")
export class LicenseController {
  constructor(
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
  ) {}

  @Get()
  async getMyLicenses(@Req() req: AuthenticatedRequest) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_USER_LICENSES, {
          userId: req.user.id,
        })
        .pipe(timeout(10000), retry(1), catchError(rpcToHttpError)),
    );
  }

  @Get(":id")
  async getLicenseById(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return firstValueFrom(
      this.paymentClient
        .send(MESSAGE_PATTERNS.PAYMENT.GET_LICENSE_BY_ID, {
          licenseId: id,
          userId: req.user.id,
        })
        .pipe(timeout(10000), retry(1), catchError(rpcToHttpError)),
    );
  }
}
```

**DTO Swagger** — purement documentaire, sérialisation via TypeORM.

**Enregistrement** : `LicenseModule` ajouté aux imports de `GatewayModule`.

## 5. Frontend — cyna-app

### 5.1 Interface `License`

**`src/app/core/interfaces/license.interface.ts`** :

```typescript
export type LicenseStatus = "active" | "revoked" | "expired" | "pending";

export interface ProductSnapshot {
  nameFr: string;
  nameEn: string;
  slug: string;
}

export interface License {
  id: string;
  licenseKey: string;
  productSnapshot: ProductSnapshot;
  orderId: string;
  status: LicenseStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  email: string;
  createdAt: string;
}
```

Exporté via `interfaces/index.ts`.

### 5.2 Service `LicenseApiService`

**`src/app/core/services/license-api.service.ts`** — calqué sur `subscription-api.service.ts` :

```typescript
@Injectable({ providedIn: "root" })
export class LicenseApiService {
  private readonly api = inject(ApiService);

  getLicenses(): Observable<License[]> {
    return this.api.get<License[]>("/licenses");
  }

  getLicenseById(id: string): Observable<License> {
    return this.api.get<License>(`/licenses/${id}`);
  }
}
```

Exporté via `services/index.ts`.

### 5.3 Refactor `DashboardLicensesPage`

Remplacement complet de la logique bricolée. Injection de `TranslateService` pour la résolution i18n du nom produit :

```typescript
getProductName(license: License): string {
  const lang = this.translate.currentLang || this.translate.defaultLang || 'fr';
  return lang === 'en' ? license.productSnapshot.nameEn : license.productSnapshot.nameFr;
}
```

Fallback sur `nameFr` pour toute langue inconnue (cohérent avec la langue par défaut CYNA).

**Suppressions** :

- Import `OrderApiService`
- Interface locale `LicenseInfo` (remplacée par `License`)
- Boucle sur orders + filtre `name.includes('license')`
- Fake key `CYNA-${order.id.substring(0, 4).toUpperCase()}-XXXX-XXXX-XXXX`

### 5.4 Template `licenses.page.html`

Bindings ajustés : `{{ getProductName(license) }}`, `{{ license.licenseKey }}`, `{{ license.status }}`, `{{ license.orderId }}`. Structure HTML inchangée.

### 5.5 Pas de store dédié

Cohérent avec la philosophie CYNA + Ionic caching : page simple, pas de state partagé.

## 6. Sécurité

### 6.1 Contrôles obligatoires

| Contrôle                    | Mise en œuvre                                                      |
| --------------------------- | ------------------------------------------------------------------ |
| Authentification            | `@UseGuards(JwtAuthGuard)` au niveau classe du `LicenseController` |
| userId injecté serveur-side | `req.user.id` depuis JWT, **jamais** query/body                    |
| Ownership check GET /:id    | `findByIdForUser` fait `WHERE id = ? AND user_id = ?` → 404        |
| Validation UUID             | `@Param('id', ParseUUIDPipe)`                                      |
| Rate limiting               | Hérité du `ThrottlerGuard` global (100 req/min)                    |
| Messages neutres            | 404 "License not found" (pas de leak d'existence)                  |
| Logs sans secrets           | Jamais de clé en clair dans les logs Winston                       |

### 6.2 Révocation RGPD sur suppression de compte

- Event `AUTH.ACCOUNT_DELETED` → `revokeAllForUser(userId)`
- Clés **non supprimées** (historique paiement conservé)
- Statut → `REVOKED`, idempotent
- Log : `Revoked N licenses for user <userId>` (pas de clé)

### 6.3 Mapping erreurs

| Cas                          | RPC                    | HTTP                      |
| ---------------------------- | ---------------------- | ------------------------- |
| Licence absente ou pas à moi | `RpcException 404`     | `404 Not Found`           |
| DB down payment-service      | Exception              | `500 Internal` (wrappé)   |
| Timeout RMQ (10s)            | `TimeoutError`         | `503 Service Unavailable` |
| Event sans licences          | `revokeAllForUser → 0` | N/A (fire-and-forget)     |

### 6.4 Checks spécifiques security-auditor agent

1. Aucun `req.query.userId` / `req.body.userId` dans le code
2. `findByIdForUser` contient `WHERE user_id`
3. Pas de leak de clé dans les logs (`grep logger.*licenseKey`)
4. Retour 404 (pas 200 ou 403) si licence pas à soi
5. Pas de `@SkipThrottle()` sur le controller
6. `ParseUUIDPipe` bien appliqué (pas de regex custom)
7. DTO de réponse ne fuit pas de champs cachés
8. CORS configuration inchangée
9. Pas de `console.log` oublié
10. `npm audit` clean sur dépendances ajoutées

## 7. Tests

### 7.1 Tests unitaires backend — à **mettre à jour** (breaking change)

| Fichier                   | Action                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| `license.service.spec.ts` | 8 occurrences de `OrderItemWithProduct[]` à enrichir avec `productSnapshot` |
| `webhook.service.spec.ts` | Vérifier le mock `generateForOrder` (ligne 46)                              |

### 7.2 Tests unitaires backend — à **ajouter**

| Fichier                      | Cas                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `license.service.spec.ts`    | `findByIdForUser` nominal / autre user → 404 / inexistant → 404                      |
| `license.service.spec.ts`    | `revokeAllForUser` affected / idempotent / licenses déjà revoked non touchées        |
| `license.service.spec.ts`    | `generateForOrder` persiste bien le `productSnapshot` / test d'immutabilité snapshot |
| `payment.controller.spec.ts` | Handlers `getUserLicenses`, `getLicenseById` / extension `handleAccountDeleted`      |

### 7.3 Tests unitaires backend — à **créer**

| Fichier                      | Cas                                                      |
| ---------------------------- | -------------------------------------------------------- |
| `license.controller.spec.ts` | Nominal GET + GET/:id / 401 / 400 UUID / RPC 404 propagé |

### 7.4 Migration — tests manuels

```bash
cd cyna-api/
npm run migration:run
psql -c "SELECT product_snapshot FROM license_keys LIMIT 1;"
npm run migration:revert
npm run migration:run
```

### 7.5 Tests E2E backend — à **créer**

**`apps/api-gateway/test/licenses/licenses.e2e-spec.ts`** :

- Setup helper : user + order + licence en DB
- GET /licenses avec JWT → shape + données
- GET /licenses sans JWT → 401
- GET /licenses/:id d'un autre user → 404
- Event RMQ `ACCOUNT_DELETED` → licenses revoked

Vérifier les helpers existants dans `apps/api-gateway/test/helpers/`.

### 7.6 Tests curl manuels

Script `docs/test-licenses-manual.sh` :

1. POST /auth/register → user test à la volée
2. POST /auth/login → cookie JWT
3. Insert licence en DB via psql (contournement webhook non wiré)
4. GET /licenses → vérif retour
5. GET /licenses/:id → vérif
6. POST /profile/delete → vérif licence revoked

### 7.7 Tests frontend (cyna-app)

| Fichier                                 | Cas                                                             |
| --------------------------------------- | --------------------------------------------------------------- |
| `license-api.service.spec.ts` (nouveau) | Mock ApiService / endpoints appelés / erreurs propagées         |
| `licenses.page.spec.ts` (nouveau)       | Loading / error / success / `getProductName` FR / EN / fallback |

### 7.8 Non-régression

- Backend : `npm run test` + `npm run test:e2e` OK
- Frontend : `npm run test` OK

## 8. Workflow Git

### 8.1 État de départ

- `cyna-api` sur `feat/email-notifications-i18n` (autre dev), `package-lock.json` modifié → stash + checkout main
- `cyna-app` sur `feat/angular-service-tests` (autre dev), mon fix authGuard uncommitted → stash + checkout main

### 8.2 Trois PRs séparées

**PR #1 — Fix authGuard** (cyna-app, `fix/subscribe-auth-guard`, indépendant, fait en premier)

**PR #2 — Backend licenses** (cyna-api, `feat/user-licenses-api`)

Commits atomiques :

- `feat(payment): add productSnapshot to LicenseKey entity + migration`
- `feat(payment): add GET_USER_LICENSES and GET_LICENSE_BY_ID patterns`
- `feat(payment): add findByIdForUser and revokeAllForUser methods`
- `feat(payment): wire licenses revocation on account deletion event`
- `feat(gateway): add /api/v1/licenses controller and module`
- `test(payment): update and add license tests`
- `test(gateway): add licenses e2e tests`

**PR #3 — Frontend licenses** (cyna-app, `feat/user-licenses-page`, dépend de PR #2 mergée)

Commits atomiques :

- `feat(core): add License interface and LicenseApiService`
- `feat(dashboard): rework licenses page to use real API`
- `test(dashboard): add LicenseApiService and licenses page tests`

### 8.3 Stratégie

- **Squash merge** sur `main` pour chaque PR
- Ordre strict : PR #1 → PR #2 → PR #3
- Validation utilisateur entre chaque merge

### 8.4 Checklist pré-merge (en description de PR)

- [ ] `npm run lint` passe
- [ ] `npm run test` passe
- [ ] `npm run test:e2e` passe (API)
- [ ] Tests curl manuels OK (API)
- [ ] Test visuel local OK (frontend)
- [ ] Commit messages `feat/fix/test/chore(scope)`
- [ ] Pas de `console.log` / `any` / TODOs orphelins
- [ ] Review agents code-reviewer + security-auditor exécutée

## 9. Orchestration des agents

L'implémentation sera exécutée par 3 agents Claude Code coordonnés :

1. **`nestjs-microservices`** — toute la partie backend (entités, migrations, services, controllers, tests)
2. **`code-reviewer`** — revue qualité (duplication, typage strict, naming, conventions CYNA)
3. **`security-auditor`** — checks de la section 6.4

Un 4e agent éventuel pour le frontend : pas d'agent Angular-specific disponible, je traite directement le frontend moi-même avec vérification par `code-reviewer`.

## 10. Flagging explicite

**Follow-up nécessaire hors scope** : wirer `LicenseService.generateForOrder()` depuis `WebhookService.handlePaymentSucceeded()`. Sans ça, la table `license_keys` reste vide (la feature est fonctionnelle mais invisible).

**Breaking change documenté** : `OrderItemWithProduct.productSnapshot` devient requis. Aucun caller de production impacté (dead code), tests à mettre à jour.

**Backoffice** : vérifié, aucune référence aux licences utilisateurs (seul usage de "license" = `productType` dans la gestion produits). Zéro impact.
