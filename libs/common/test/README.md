# cyna-api — Test helpers

Factories de mocks réutilisables pour les specs Jest des microservices.

## Usage

```ts
import {
  createMockRepository,
  createMockClientProxy,
  createMockStripe,
  createMockI18nService,
  createMockLogger,
  buildStripeEvent,
} from '../../../libs/common/test/mocks';
```

## Factories disponibles

### `createMockRepository<T>()`

Retourne un `Partial<Repository<T>>` typé avec toutes les méthodes courantes en `jest.fn()` (find, findOne, save, create, update, delete, softDelete, count, exists, createQueryBuilder…). Inclut un `manager.transaction` qui exécute le callback directement.

### `createMockQueryBuilder<T>()`

Mock de `SelectQueryBuilder<T>` chaînable (where, andWhere, leftJoin, orderBy, skip, take, getMany, getOne…). Utilisé automatiquement par `createMockRepository().createQueryBuilder()`.

### `createMockClientProxy(defaultResponse?)`

Mock de `ClientProxy` RabbitMQ. `send()` retourne un Observable contenant `defaultResponse`, `emit()` retourne un Observable vide. Helper `asClientProxy(mock)` pour cast typé.

### `createMockStripe()`

Mock complet du SDK Stripe : customers, paymentIntents, subscriptions, prices, products, checkout.sessions, invoices, refunds, webhooks. Tous les retours sont des fixtures par défaut, override-able par `mock.X.Y.mockResolvedValueOnce(...)`.

### `buildStripeEvent(type, data, id?)`

Construit un `Stripe.Event` synthétique pour tester les webhooks. Type complet avec `id`, `livemode`, `created`, `api_version`, etc.

### `createMockI18nService()`

Mock `I18nService` qui renvoie la clé telle quelle (`t('errors.cart.empty')` → `'errors.cart.empty'`), avec substitution `{var}` si `options.args` fourni.

### `createMockLogger()`

Mock du `CynaLoggerService` / `Logger` Nest (log, error, warn, debug, verbose, fatal, setContext).

### `createMockCacheService()` / `createMockRedisClient()`

Mocks Cache Manager + ioredis bas niveau (get, set, setex, del, expire, exists, incr, ttl).

## Pattern recommandé pour un spec

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  createMockRepository,
  createMockClientProxy,
  createMockLogger,
} from '@cyna-api/common-test/mocks';
import { MyService } from './my.service';
import { MyEntity } from '../entities/my.entity';

describe('MyService', () => {
  let service: MyService;
  let repo: ReturnType<typeof createMockRepository<MyEntity>>;
  let downstreamClient: ReturnType<typeof createMockClientProxy>;

  beforeEach(async () => {
    repo = createMockRepository<MyEntity>();
    downstreamClient = createMockClientProxy({ id: 'mocked-result' });

    const module = await Test.createTestingModule({
      providers: [
        MyService,
        { provide: getRepositoryToken(MyEntity), useValue: repo },
        { provide: 'DOWNSTREAM_SERVICE', useValue: downstreamClient },
        { provide: 'CynaLoggerService', useValue: createMockLogger() },
      ],
    }).compile();

    service = module.get(MyService);
  });

  it('returns persisted entity', async () => {
    repo.findOne!.mockResolvedValueOnce({ id: '1' } as MyEntity);
    await expect(service.findById('1')).resolves.toEqual({ id: '1' });
  });
});
```

## Convention

- Importer les factories par leur fonction (`createMockX`), pas par déstructuration d'objet global.
- Utiliser `mockResolvedValueOnce` / `mockReturnValueOnce` pour les cas spécifiques à un test, garder les défauts pour le cas nominal.
- Ne PAS étendre les factories pour des cas trop spécifiques — c'est OK de réécrire un mock local quand le cas est unique.
- Ne PAS faire d'assertion sur des appels internes au mock dans le `beforeEach` (gardez les `expect()` dans les `it()`).
