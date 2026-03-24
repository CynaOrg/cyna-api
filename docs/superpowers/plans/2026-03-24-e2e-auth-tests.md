# E2E Auth Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ~35 E2E tests covering the full authentication flow (user + admin) with real PostgreSQL and RabbitMQ.

**Architecture:** Tests bootstrap the API Gateway as an HTTP app and the Auth Service as a RabbitMQ microservice in a single Jest process. Supertest sends HTTP requests to the gateway, which communicates with auth-service via RabbitMQ, which persists in PostgreSQL. GitHub Actions service containers provide PostgreSQL 16 and RabbitMQ 3.

**Tech Stack:** NestJS TestingModule, Jest, supertest, PostgreSQL 16, RabbitMQ 3, TypeORM (synchronize mode)

**Spec:** `docs/superpowers/specs/2026-03-24-e2e-auth-tests-design.md`

---

## File Map

| File                                                         | Action | Responsibility                                                 |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------- |
| `package.json`                                               | Modify | Add supertest dependency                                       |
| `apps/api-gateway/test/jest-e2e.json`                        | Create | Jest E2E configuration                                         |
| `apps/api-gateway/test/setup.ts`                             | Create | Bootstrap gateway + auth-service, expose app + dataSource      |
| `apps/api-gateway/test/helpers/auth.helper.ts`               | Create | registerUser, loginUser, registerAndVerifyUser, createAdmin    |
| `apps/api-gateway/test/helpers/db.helper.ts`                 | Create | cleanDatabase, getVerificationToken, getResetToken, get2FACode |
| `apps/api-gateway/test/auth/user-registration.e2e-spec.ts`   | Create | 8 registration + email verification tests                      |
| `apps/api-gateway/test/auth/user-login.e2e-spec.ts`          | Create | 5 login tests                                                  |
| `apps/api-gateway/test/auth/user-token.e2e-spec.ts`          | Create | 5 token management tests                                       |
| `apps/api-gateway/test/auth/user-logout.e2e-spec.ts`         | Create | 3 logout tests                                                 |
| `apps/api-gateway/test/auth/user-password-reset.e2e-spec.ts` | Create | 5 password reset tests                                         |
| `apps/api-gateway/test/auth/admin-auth.e2e-spec.ts`          | Create | 7 admin 2FA tests                                              |
| `apps/api-gateway/test/auth/authorization.e2e-spec.ts`       | Create | 6 guard/authorization tests                                    |
| `apps/api-gateway/test/auth/rate-limiting.e2e-spec.ts`       | Create | 3 rate limiting tests                                          |
| `.github/workflows/ci.yml`                                   | Modify | Add e2e job with service containers                            |

---

### Task 1: Install dependencies and create Jest E2E config

**Files:**

- Modify: `package.json`
- Create: `apps/api-gateway/test/jest-e2e.json`

- [ ] **Step 1: Install supertest**

```bash
cd /Users/iliesmahoudeau/IdeaProjects/cyna-workspace/cyna-api
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: Create jest-e2e.json**

Create `apps/api-gateway/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@cyna-api/common(.*)$": "<rootDir>/../../../libs/common/src$1",
    "^@cyna-api/s3(.*)$": "<rootDir>/../../../libs/s3/src$1"
  },
  "setupFilesAfterSetup": ["./setup.ts"],
  "testTimeout": 30000
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json apps/api-gateway/test/jest-e2e.json
git commit -m "chore: add supertest and jest-e2e config for E2E auth tests"
```

---

### Task 2: Create test setup (bootstrap gateway + auth-service)

**Files:**

- Create: `apps/api-gateway/test/setup.ts`

This is the most critical file. It bootstraps:

1. The Auth Service as a NestJS microservice (listening on RabbitMQ)
2. The API Gateway as an HTTP app (for supertest)

- [ ] **Step 1: Create setup.ts**

Create `apps/api-gateway/test/setup.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, INestMicroservice, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { GatewayModule } from '../src/gateway.module';
import { AuthModule } from '../../../auth-service/src/auth.module';

let app: INestApplication;
let authMicroservice: INestMicroservice;
let dataSource: DataSource;

export async function setupTestApp(): Promise<{
  app: INestApplication;
  dataSource: DataSource;
}> {
  // 1. Bootstrap Auth Service microservice
  const authModule: TestingModule = await Test.createTestingModule({
    imports: [AuthModule],
  }).compile();

  authMicroservice = authModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
      queue: 'auth.queue',
      queueOptions: { durable: true },
      noAck: true,
    },
  });

  await authMicroservice.listen();

  // 2. Bootstrap API Gateway HTTP app
  const gatewayModule: TestingModule = await Test.createTestingModule({
    imports: [GatewayModule],
  }).compile();

  app = gatewayModule.createNestApplication();

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  // 3. Get DataSource for direct DB access in tests
  dataSource = authModule.get<DataSource>(DataSource);

  return { app, dataSource };
}

export async function teardownTestApp(): Promise<void> {
  if (app) await app.close();
  if (authMicroservice) await authMicroservice.close();
}

export { app, dataSource };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-gateway/test/setup.ts
git commit -m "test: add E2E test setup bootstrapping gateway + auth-service"
```

---

### Task 3: Create test helpers

**Files:**

- Create: `apps/api-gateway/test/helpers/db.helper.ts`
- Create: `apps/api-gateway/test/helpers/auth.helper.ts`

- [ ] **Step 1: Create db.helper.ts**

Create `apps/api-gateway/test/helpers/db.helper.ts`:

```typescript
import { DataSource } from 'typeorm';

export async function cleanDatabase(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }
}

export async function getVerificationToken(
  dataSource: DataSource,
  userId: string,
): Promise<string | null> {
  const result = await dataSource.query(
    `SELECT token FROM email_verification_tokens WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  return result[0]?.token || null;
}

export async function getPasswordResetToken(
  dataSource: DataSource,
  userId: string,
): Promise<string | null> {
  const result = await dataSource.query(
    `SELECT token FROM password_reset_tokens WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  return result[0]?.token || null;
}

export async function get2FACode(dataSource: DataSource, adminId: string): Promise<string | null> {
  const result = await dataSource.query(
    `SELECT code FROM admin_2fa_codes WHERE "adminId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [adminId],
  );
  return result[0]?.code || null;
}
```

**Note:** The tokens stored in DB are SHA256 hashed. The test helper needs to read the raw token. The auth service hashes tokens before storing them, but during the test we'll need to intercept the raw token. This will require reading the token from the event emitter or overriding the token generation. The implementation agent should check how `TokenService.generateSecureToken()` and `TokenService.hashToken()` work and adapt the helper accordingly — either by:

1. Mocking the notification service to capture the email content (which contains the raw token)
2. Or by reading the hashed token from DB and using it directly if the endpoint accepts hashed tokens

- [ ] **Step 2: Create auth.helper.ts**

Create `apps/api-gateway/test/helpers/auth.helper.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const DEFAULT_USER = {
  email: 'test@example.com',
  password: 'TestPass123!',
  firstName: 'Test',
  lastName: 'User',
};

const DEFAULT_ADMIN = {
  email: 'admin@cyna.it',
  password: 'AdminPass123!',
  firstName: 'Admin',
  lastName: 'Test',
  role: 'super_admin',
};

export function getDefaultUser() {
  return { ...DEFAULT_USER };
}

export function getDefaultAdmin() {
  return { ...DEFAULT_ADMIN };
}

export async function registerUser(
  app: INestApplication,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ ...DEFAULT_USER, ...dto });
}

export async function registerAndVerifyUser(
  app: INestApplication,
  dataSource: DataSource,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<{ userId: string; response: request.Response }> {
  // Register
  const registerRes = await registerUser(app, dto);
  const userId = registerRes.body?.data?.user?.id;

  // Get verification token from DB (hashed)
  // We need the raw token — see db.helper.ts note
  const token = await getVerificationTokenRaw(dataSource, userId);

  // Verify email
  await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

  return { userId, response: registerRes };
}

export async function loginUser(
  app: INestApplication,
  dto?: Partial<typeof DEFAULT_USER>,
): Promise<{ accessToken: string; cookies: string[] }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: dto?.email || DEFAULT_USER.email,
      password: dto?.password || DEFAULT_USER.password,
    });

  return {
    accessToken: res.body?.data?.accessToken,
    cookies: res.headers['set-cookie'] || [],
  };
}

export async function createAdmin(
  dataSource: DataSource,
  dto?: Partial<typeof DEFAULT_ADMIN>,
): Promise<{ id: string }> {
  const admin = { ...DEFAULT_ADMIN, ...dto };
  const passwordHash = await bcrypt.hash(admin.password, 12);

  const result = await dataSource.query(
    `INSERT INTO admins (email, "passwordHash", "firstName", "lastName", role, "isActive")
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [admin.email, passwordHash, admin.firstName, admin.lastName, admin.role],
  );

  return { id: result[0].id };
}

// Internal helper — implementation agent should adapt based on actual token storage
async function getVerificationTokenRaw(dataSource: DataSource, userId: string): Promise<string> {
  // The auth service stores hashed tokens. To test verification,
  // we need to either:
  // 1. Intercept the notification event to get the raw token
  // 2. Or query the DB for the hashed token and use a known mapping
  // The implementation agent should determine the best approach.
  throw new Error('Implementation needed — see design notes');
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/helpers/
git commit -m "test: add E2E test helpers for auth and database operations"
```

---

### Task 4: User Registration E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/user-registration.e2e-spec.ts`

- [ ] **Step 1: Write registration tests**

8 test cases:

1. Register with valid data → 201 + user returned (no passwordHash exposed)
2. Register with existing email → 409
3. Register with weak password (no uppercase) → 400
4. Register with weak password (no special char) → 400
5. Register with invalid email → 400
6. Verify email with valid token → success
7. Verify email with invalid token → 400
8. Resend verification → success

Each test should use `cleanDatabase()` in `beforeEach` and the shared `setupTestApp()`/`teardownTestApp()` in `beforeAll`/`afterAll`.

- [ ] **Step 2: Run tests to verify they fail (no implementation issues since we test existing endpoints)**

```bash
npm run test:e2e
```

- [ ] **Step 3: Fix any test issues and iterate**

- [ ] **Step 4: Commit**

```bash
git add apps/api-gateway/test/auth/user-registration.e2e-spec.ts
git commit -m "test(e2e): add user registration and email verification tests"
```

---

### Task 5: User Login E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/user-login.e2e-spec.ts`

- [ ] **Step 1: Write login tests**

5 test cases:

1. Login with valid credentials → 200 + accessToken + refresh_token cookie
2. Login with wrong password → 401
3. Login with non-existent email → 401 (same error as wrong password)
4. Login with unverified email → 403
5. Login with disabled account → 403

Tests should use `registerAndVerifyUser()` helper in `beforeEach` to have a verified user ready.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/user-login.e2e-spec.ts
git commit -m "test(e2e): add user login tests"
```

---

### Task 6: Token Management E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/user-token.e2e-spec.ts`

- [ ] **Step 1: Write token tests**

5 test cases:

1. Refresh token from cookie → new accessToken + new refresh_token cookie
2. Refresh token from body → new accessToken
3. Refresh with invalid token → 401
4. Max 5 sessions: login 6 times, verify oldest session is revoked
5. Grace period: refresh, then immediately refresh with old token (within 30s) → should succeed

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/user-token.e2e-spec.ts
git commit -m "test(e2e): add token management tests"
```

---

### Task 7: User Logout E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/user-logout.e2e-spec.ts`

- [ ] **Step 1: Write logout tests**

3 test cases:

1. Logout with valid JWT → 200 + cookie cleared
2. Logout without JWT → 401
3. Double logout → no error (idempotent)

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/user-logout.e2e-spec.ts
git commit -m "test(e2e): add user logout tests"
```

---

### Task 8: Password Reset E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/user-password-reset.e2e-spec.ts`

- [ ] **Step 1: Write password reset tests**

5 test cases:

1. Forgot password with existing email → 200 (silent response)
2. Forgot password with non-existent email → 200 (same response for security)
3. Reset password with valid token → success
4. Reset password with invalid/expired token → 400
5. Login with new password after reset → success + old refresh tokens revoked

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/user-password-reset.e2e-spec.ts
git commit -m "test(e2e): add password reset flow tests"
```

---

### Task 9: Admin Auth 2FA E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/admin-auth.e2e-spec.ts`

- [ ] **Step 1: Write admin auth tests**

7 test cases:

1. Admin login → requires2FA + tempToken
2. Verify 2FA with correct code (read from DB via helper) → accessToken + cookie
3. Verify 2FA with wrong code → 401
4. Verify 2FA with expired code → 401 (manually expire in DB)
5. Resend 2FA → new code
6. Admin refresh token → new accessToken
7. Admin logout → token revoked

Use `createAdmin()` helper to insert admin directly in DB before tests.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/admin-auth.e2e-spec.ts
git commit -m "test(e2e): add admin authentication with 2FA tests"
```

---

### Task 10: Authorization Guard E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/authorization.e2e-spec.ts`

- [ ] **Step 1: Write authorization tests**

6 test cases:

1. Protected route (e.g. POST /auth/logout) without token → 401
2. Protected route with malformed token → 401
3. Protected route with expired token (craft JWT with past exp) → 401
4. @Public() route (e.g. POST /auth/login) without token → not 401
5. Admin route with user token → 403
6. Super admin route with regular admin token → 403

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/authorization.e2e-spec.ts
git commit -m "test(e2e): add authorization guard tests"
```

---

### Task 11: Rate Limiting E2E tests

**Files:**

- Create: `apps/api-gateway/test/auth/rate-limiting.e2e-spec.ts`

- [ ] **Step 1: Write rate limiting tests**

3 test cases:

1. Login: send 6 requests in quick succession → 6th returns 429
2. Register: send 4 requests → 4th returns 429
3. Forgot password: send 4 requests → 4th returns 429

**Note:** ThrottlerModule uses in-memory storage by default. Tests must run sequentially within this file. Consider resetting the throttler between test files (app restart).

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/test/auth/rate-limiting.e2e-spec.ts
git commit -m "test(e2e): add rate limiting tests"
```

---

### Task 12: Update CI workflow with E2E job

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add e2e job to ci.yml**

Add after existing `ci` job:

```yaml
e2e:
  needs: ci
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_DB: cyna_test
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
    rabbitmq:
      image: rabbitmq:3-management
      ports:
        - 5672:5672
      options: >-
        --health-cmd "rabbitmq-diagnostics check_port_connectivity"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  env:
    DATABASE_HOST: localhost
    DATABASE_PORT: 5432
    DATABASE_USER: test
    DATABASE_PASSWORD: test
    DATABASE_NAME: cyna_test
    DATABASE_SYNC: true
    RABBITMQ_URL: amqp://guest:guest@localhost:5672
    JWT_SECRET: e2e-test-secret-key-minimum-32-chars
    NODE_ENV: test
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - name: Install dependencies
      run: npm ci
    - name: Run E2E tests
      run: npm run test:e2e
```

- [ ] **Step 2: Verify CI workflow syntax**

```bash
cd /Users/iliesmahoudeau/IdeaProjects/cyna-workspace/cyna-api
cat .github/workflows/ci.yml  # Review the full file
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add E2E test job with PostgreSQL and RabbitMQ service containers"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run all E2E tests locally**

Requires PostgreSQL and RabbitMQ running locally (via docker-compose):

```bash
cd /Users/iliesmahoudeau/IdeaProjects/cyna-workspace/cyna-api
npm run start:infra  # Start PostgreSQL + RabbitMQ
npm run test:e2e     # Run all E2E tests
```

Expected: All ~35 tests pass.

- [ ] **Step 2: Run unit tests to verify no regressions**

```bash
npm run test:cov
```

Expected: All 318 unit tests still pass.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin feat/e2e-auth-tests
```

Then create PR: `develop` ← `feat/e2e-auth-tests`
