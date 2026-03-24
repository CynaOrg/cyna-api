# E2E Auth Tests Design

## Context

ClickUp task: Tests E2E Auth Flow (test-007, urgent)
Branch: `feat/e2e-auth-tests`
Repo: cyna-api

## Architecture

E2E tests bootstrap the real API Gateway + Auth Service in a single NestJS TestingModule process, connected to real PostgreSQL and RabbitMQ launched as GitHub Actions service containers.

```
GitHub Actions
├── PostgreSQL 16 (service container, port 5432)
├── RabbitMQ 3 (service container, port 5672)
└── Jest E2E
    └── NestJS TestingModule
        ├── API Gateway (HTTP via supertest)
        └── Auth Service (via RabbitMQ)
```

Supertest sends HTTP requests to the gateway, which communicates with auth-service via RabbitMQ, which persists in PostgreSQL. Full end-to-end flow.

## File Structure

```
apps/api-gateway/test/
├── jest-e2e.json
├── setup.ts
├── helpers/
│   ├── auth.helper.ts
│   └── db.helper.ts
└── auth/
    ├── user-registration.e2e-spec.ts
    ├── user-login.e2e-spec.ts
    ├── user-token.e2e-spec.ts
    ├── user-logout.e2e-spec.ts
    ├── user-password-reset.e2e-spec.ts
    ├── admin-auth.e2e-spec.ts
    ├── authorization.e2e-spec.ts
    └── rate-limiting.e2e-spec.ts
```

## Test Scenarios (~35 total)

### User Registration (user-registration.e2e-spec.ts)

- Register with valid data -> 201 + user returned
- Register with existing email -> 409 Conflict
- Register with weak password (no uppercase, no special, etc.) -> 400
- Register with invalid email -> 400
- Verify email with valid token -> success
- Verify email with expired/invalid token -> 400
- Resend verification -> success
- Resend verification for already verified email -> error

### User Login (user-login.e2e-spec.ts)

- Login with valid credentials -> 200 + accessToken + refresh_token cookie
- Login with wrong password -> 401
- Login with non-existent email -> 401 (same message as wrong password, security)
- Login with unverified email -> 403
- Login with disabled account -> 403

### Token Management (user-token.e2e-spec.ts)

- Refresh token from cookie -> new accessToken + new cookie
- Refresh token from body -> new accessToken
- Refresh expired/invalid token -> 401
- Max 5 sessions: 6th login revokes oldest
- Grace period 30s: recently revoked refresh token accepted

### User Logout (user-logout.e2e-spec.ts)

- Logout with valid JWT -> refresh token revoked + cookie cleared
- Logout without JWT -> 401
- Double logout (already revoked token) -> no error

### Password Reset (user-password-reset.e2e-spec.ts)

- Forgot password with existing email -> 200 (silent response)
- Forgot password with non-existent email -> 200 (same response, security)
- Reset password with valid token -> success + all refresh tokens revoked
- Reset password with expired token -> 400
- Login with new password after reset -> success

### Admin Auth 2FA (admin-auth.e2e-spec.ts)

- Admin login -> requires2FA: true + tempToken
- Verify 2FA with correct code -> accessToken + admin_refresh_token cookie
- Verify 2FA with wrong code -> 401
- Verify 2FA with expired code -> 401
- Resend 2FA -> new code sent
- Admin refresh token -> new accessToken
- Admin logout -> token revoked

### Authorization (authorization.e2e-spec.ts)

- Protected route without token -> 401
- Protected route with invalid token -> 401
- Protected route with expired token -> 401
- @Public() route without token -> 200
- Admin route with user token -> 403
- Super admin route with regular admin token -> 403

### Rate Limiting (rate-limiting.e2e-spec.ts)

- Login: 6th attempt in 1 min -> 429 Too Many Requests
- Register: 4th attempt in 1 min -> 429
- Forgot password: 4th attempt in 5 min -> 429

## CI Workflow

Separate `e2e` job in existing ci.yml, runs only after unit tests pass:

```yaml
jobs:
  ci:
    # existing: lint + unit tests + build

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
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      rabbitmq:
        image: rabbitmq:3-management
        ports: ['5672:5672']
        options: --health-cmd "rabbitmq-diagnostics check_port_connectivity" --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:e2e
    env:
      DATABASE_URL: postgres://test:test@localhost:5432/cyna_test
      RABBITMQ_URL: amqp://guest:guest@localhost:5672
      JWT_SECRET: test-secret-for-e2e
      NODE_ENV: test
```

## Dependencies to Install

- `supertest` + `@types/supertest` (HTTP testing)

## Test Helpers

### auth.helper.ts

Utility functions to avoid repetition:

- `registerUser(app, dto?)` -> registers and returns response
- `registerAndVerifyUser(app, dto?)` -> registers, extracts verification token from DB, verifies, returns user
- `loginUser(app, dto?)` -> logs in verified user, returns { accessToken, cookies }
- `createAdmin(dataSource, dto?)` -> inserts admin directly in DB with hashed password

### db.helper.ts

- `cleanDatabase(dataSource)` -> truncates all auth tables between test suites
- `getVerificationToken(dataSource, userId)` -> reads unhashed token for testing
- `getPasswordResetToken(dataSource, userId)` -> reads unhashed token for testing
- `get2FACode(dataSource, adminId)` -> reads 2FA code for testing

## Key Design Decisions

1. **Real DB over mocks**: Tests verify actual SQL queries, bcrypt hashing, token persistence
2. **One file per domain**: Easy to run individual test suites, clear ownership
3. **DB cleanup between suites**: Each test file starts with clean state
4. **Token extraction from DB**: For email verification and password reset, we read tokens directly from DB since we don't have a real email service in tests
5. **Separate CI job**: E2E tests don't block fast feedback from unit tests
6. **No rate limiting in most tests**: Rate limiter reset between test files, dedicated file for rate limit tests
