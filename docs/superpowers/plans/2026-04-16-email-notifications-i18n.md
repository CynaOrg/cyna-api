# Email Notifications & i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two reported production bugs — (1) no email is sent on purchase, (2) emails arrive only in English — by adding 10 missing customer-facing emails (P0+P1) and persisting a notification context snapshot (`email` + `preferredLanguage`) on `Order` and `Subscription` entities so every downstream event can be localized.

**Architecture:** Snapshot-then-enrich. Notification context is frozen on `Order`/`Subscription` at creation time. The Payment `WebhookService` reads that snapshot (directly for subscription events, via a single RPC to Order service for payment-intent events) and emits enriched typed events to `notification.queue`. A new `PaymentEventsHandler` and three new methods on `AuthEventsHandler` consume those events and render Handlebars templates in fr/en.

**Tech Stack:** NestJS 10 microservices, TypeORM, PostgreSQL, RabbitMQ (`@nestjs/microservices` RMQ transport), Handlebars, Nodemailer, Jest.

**Spec:** `docs/superpowers/specs/2026-04-16-email-notifications-i18n-design.md`

**Branch:** `feat/email-notifications-i18n` (local only, no push, no PR until explicit approval)

---

## Conventions used in this plan

- All commands are run from `cyna-api/` (the monorepo root for cyna-api).
- All commit messages are English, follow `type(scope): short description`, and include the `Co-Authored-By: Claude` trailer (user convention).
- `Language` is imported from `@cyna-api/common` (`libs/common/src/enums/language.enum.ts`).
- When a test file already exists for a file we are modifying, we append new describe blocks; we do not rewrite existing tests.
- `render()`'s strict `Record<string, string | number>` variable typing means every template variable must be flattened to a string or number **before** calling render. Dates → ISO/locale string. Arrays → pre-joined string. This is not negotiable.
- Every template's `variables` object must include `frontendUrl` and `year` (the shared `base.hbs` layout consumes them).

---

## Task 1: Create typed event DTOs (foundation)

**Files:**

- Create: `libs/common/src/events/payment-events.dto.ts`
- Create: `libs/common/src/events/auth-events.dto.ts`
- Create: `libs/common/src/events/index.ts`
- Modify: `libs/common/src/index.ts`

- [ ] **Step 1.1: Write payment-events DTO file**

Create `libs/common/src/events/payment-events.dto.ts` with:

```typescript
import { Language } from '../enums/language.enum';

export interface PaymentConfirmedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  total: number;
  currency: string;
  itemsSummary: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  error: string;
}

export interface SubscriptionCreatedEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
  billingPeriod: string;
  price: number;
  currency: string;
}

export interface SubscriptionRenewedEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
  newPeriodEnd: string;
}

export interface SubscriptionPastDueEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
}

export interface SubscriptionCancelledEvent {
  subscriptionId: string;
  userId: string;
  email: string;
  language: Language;
  productName: string;
}

export interface RefundedEvent {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  language: Language;
  refundAmount: number;
  currency: string;
}
```

- [ ] **Step 1.2: Write auth-events DTO file**

Create `libs/common/src/events/auth-events.dto.ts`:

```typescript
import { Language } from '../enums/language.enum';

export interface UserVerifiedEvent {
  userId: string;
  email: string;
  language: Language;
}

export interface PasswordChangedEvent {
  userId: string;
  email: string;
  language: Language;
  timestamp: Date;
}

export interface PasswordResetCompletedEvent {
  userId: string;
  email: string;
  language: Language;
  timestamp: Date;
}
```

- [ ] **Step 1.3: Write barrel export**

Create `libs/common/src/events/index.ts`:

```typescript
export * from './payment-events.dto';
export * from './auth-events.dto';
```

- [ ] **Step 1.4: Wire the barrel into the common package root**

Open `libs/common/src/index.ts`. Find the `export * from './rabbitmq';` line (around line 36). Add below it:

```typescript
export * from './events';
```

- [ ] **Step 1.5: Type-check**

Run: `cd cyna-api && npx tsc --noEmit --project tsconfig.json`
Expected: No errors.

- [ ] **Step 1.6: Commit**

```bash
cd cyna-api && git add libs/common/src/events libs/common/src/index.ts
git commit -m "$(cat <<'EOF'
feat(common): add typed DTOs for payment and auth notification events

Introduces 7 payment event interfaces and 3 auth event interfaces that
both publishers (payment, auth services) and subscribers (notification
service) will depend on. Each event carries the notification context
(email + language) needed to deliver a localized email.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add snapshot columns to Order and Subscription entities

**Files:**

- Modify: `apps/order-service/src/entities/order.entity.ts`
- Modify: `apps/payment-service/src/entities/subscription.entity.ts`
- Create: `apps/order-service/src/migrations/1745000000000-AddNotificationSnapshotToOrders.ts`
- Create: `apps/payment-service/src/migrations/1745000000001-AddNotificationSnapshotToSubscriptions.ts`

Note: no unit tests for entity column additions — these are declarative schema. Tests come in Task 3 when we populate the snapshot.

- [ ] **Step 2.1: Add snapshot columns to Order entity**

Open `apps/order-service/src/entities/order.entity.ts`. At the top, ensure `Language` is imported from `@cyna-api/common`:

```typescript
import { Language } from '@cyna-api/common';
```

After the existing `guestEmail` column (around line 17), add:

```typescript
  @Column({ name: 'notification_email', type: 'varchar', length: 255, nullable: true })
  notificationEmail: string | null;

  @Column({
    name: 'notification_language',
    type: 'enum',
    enum: Language,
    nullable: true,
  })
  notificationLanguage: Language | null;
```

- [ ] **Step 2.2: Add snapshot columns to Subscription entity**

Open `apps/payment-service/src/entities/subscription.entity.ts`. Add `Language` to the existing `@cyna-api/common` import. Before the class's closing brace, add:

```typescript
  @Column({ name: 'notification_email', type: 'varchar', length: 255, nullable: true })
  notificationEmail: string | null;

  @Column({
    name: 'notification_language',
    type: 'enum',
    enum: Language,
    nullable: true,
  })
  notificationLanguage: Language | null;
```

- [ ] **Step 2.3: Verify neither service has a `migrations/` directory yet**

Run:

```bash
ls cyna-api/apps/order-service/src/migrations 2>&1
ls cyna-api/apps/payment-service/src/migrations 2>&1
```

Expected: `No such file or directory` for both. If one exists, use the highest existing timestamp + 1 instead of `1745000000000`/`1745000000001`.

- [ ] **Step 2.4: Write order migration**

Create `apps/order-service/src/migrations/1745000000000-AddNotificationSnapshotToOrders.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSnapshotToOrders1745000000000 implements MigrationInterface {
  name = 'AddNotificationSnapshotToOrders1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "orders_notification_language_enum" AS ENUM('fr', 'en')`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "notification_email" VARCHAR(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "notification_language" "orders_notification_language_enum" DEFAULT NULL`,
    );
    // Backfill: guest orders carry their email in guest_email; copy it.
    await queryRunner.query(
      `UPDATE "orders" SET "notification_email" = "guest_email" WHERE "user_id" IS NULL AND "guest_email" IS NOT NULL`,
    );
    // Default language for legacy rows. Cross-DB backfill to users.preferred_language
    // is not possible (users are in auth-service DB). New rows will populate correctly
    // via order.service.ts.
    await queryRunner.query(
      `UPDATE "orders" SET "notification_language" = 'fr' WHERE "notification_language" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "notification_language"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "notification_email"`);
    await queryRunner.query(`DROP TYPE "orders_notification_language_enum"`);
  }
}
```

- [ ] **Step 2.5: Write subscription migration**

Create `apps/payment-service/src/migrations/1745000000001-AddNotificationSnapshotToSubscriptions.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSnapshotToSubscriptions1745000000001 implements MigrationInterface {
  name = 'AddNotificationSnapshotToSubscriptions1745000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "subscriptions_notification_language_enum" AS ENUM('fr', 'en')`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "notification_email" VARCHAR(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "notification_language" "subscriptions_notification_language_enum" DEFAULT NULL`,
    );
    // Backfill: legacy rows get 'fr' default. Cross-DB backfill to users.preferred_language
    // is not possible. Renewal emails for pre-existing subscriptions will be in French
    // until the user places a new order/subscription.
    await queryRunner.query(
      `UPDATE "subscriptions" SET "notification_language" = 'fr' WHERE "notification_language" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "notification_language"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "notification_email"`);
    await queryRunner.query(`DROP TYPE "subscriptions_notification_language_enum"`);
  }
}
```

- [ ] **Step 2.6: Verify TypeScript compiles**

Run: `cd cyna-api && npx tsc --noEmit --project tsconfig.json`
Expected: No errors.

- [ ] **Step 2.7: Commit**

```bash
cd cyna-api && git add \
  apps/order-service/src/entities/order.entity.ts \
  apps/payment-service/src/entities/subscription.entity.ts \
  apps/order-service/src/migrations \
  apps/payment-service/src/migrations
git commit -m "$(cat <<'EOF'
feat(order): add email and preferredLanguage snapshot to Order and Subscription entities

Adds notification_email and notification_language columns to both orders
and subscriptions tables. These act as the single source of truth for
notification context on the webhook critical path, removing the need for
cross-service chained lookups at email send time. Migrations include
backfill: guest orders copy guest_email, all legacy rows default to 'fr'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Populate the snapshot at Order and Subscription creation

**Files:**

- Modify: `apps/order-service/src/services/order.service.ts`
- Modify: `apps/order-service/src/services/order.service.spec.ts` (if exists — otherwise skip and note)
- Modify: `apps/order-service/src/controllers/order.controller.ts`
- Modify: `apps/payment-service/src/services/payment.service.ts`
- Modify: `apps/payment-service/src/services/payment.service.spec.ts` (if exists — otherwise skip and note)

- [ ] **Step 3.1: Read the existing `createOrderFromCart` signature to confirm the data contract**

Run: `cd cyna-api && grep -n "createOrderFromCart\|notificationEmail" apps/order-service/src/services/order.service.ts | head -20`
Note the exact signature and the location of the `this.orderRepository.create({...})` call.

- [ ] **Step 3.2: Check whether `order.service.spec.ts` exists and is testing createOrderFromCart**

Run: `cd cyna-api && ls apps/order-service/src/services/*.spec.ts 2>&1 && grep -l "createOrderFromCart" apps/order-service/src/services/*.spec.ts 2>&1`
If a spec file tests `createOrderFromCart`, add a failing test in Step 3.3. Otherwise, skip Steps 3.3–3.4 and proceed directly to Step 3.5 (implement without TDD because there is no existing test harness to extend).

- [ ] **Step 3.3 (conditional): Write failing test for Order snapshot population**

If Step 3.2 confirmed a spec file exists, add this describe block to `apps/order-service/src/services/order.service.spec.ts`:

```typescript
describe('createOrderFromCart notification snapshot', () => {
  it('persists notificationEmail and notificationLanguage from the input data', async () => {
    const input = {
      userId: 'user-1',
      email: 'user@example.com',
      preferredLanguage: 'en' as const,
      cartId: 'cart-1',
      billingAddress: {},
      items: [],
      totalAmount: 100,
      currency: 'EUR',
    };
    // Arrange: mock cart + catalog clients per existing spec patterns.
    // Act:
    await service.createOrderFromCart(input);
    // Assert:
    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationEmail: 'user@example.com',
        notificationLanguage: 'en',
      }),
    );
  });

  it("defaults notificationLanguage to 'fr' when preferredLanguage is undefined", async () => {
    const input = {
      userId: 'user-1',
      email: 'user@example.com',
      cartId: 'cart-1',
      billingAddress: {},
      items: [],
      totalAmount: 100,
      currency: 'EUR',
    };
    await service.createOrderFromCart(input);
    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationEmail: 'user@example.com',
        notificationLanguage: 'fr',
      }),
    );
  });
});
```

- [ ] **Step 3.4 (conditional): Run the tests and confirm they fail**

Run: `cd cyna-api && npx jest --testPathPattern=order.service.spec --testNamePattern='notification snapshot' -w 1`
Expected: 2 FAIL with `notificationEmail`/`notificationLanguage` not being passed.

- [ ] **Step 3.5: Implement Order snapshot population**

Open `apps/order-service/src/services/order.service.ts`. Extend the `data` parameter type of `createOrderFromCart` with:

```typescript
preferredLanguage?: Language;
```

Add `Language` to the `@cyna-api/common` import at the top of the file.

Inside the `this.orderRepository.create({...})` call, add these two lines:

```typescript
      notificationEmail: data.email,
      notificationLanguage: data.preferredLanguage ?? Language.FR,
```

- [ ] **Step 3.6 (conditional): Run the new tests to confirm they pass**

Run: `cd cyna-api && npx jest --testPathPattern=order.service.spec --testNamePattern='notification snapshot' -w 1`
Expected: 2 PASS.

- [ ] **Step 3.7: Update CREATE_ORDER payload type in the controller**

Open `apps/order-service/src/controllers/order.controller.ts`. Locate the `MESSAGE_PATTERNS.ORDER.CREATE_ORDER` handler (around line 123). Extend the inline payload type with `preferredLanguage?: string;` alongside the existing `email`, `userId`, etc. Pass it through when calling `this.orderService.createOrderFromCart`.

- [ ] **Step 3.8: Implement Subscription snapshot population**

Open `apps/payment-service/src/services/payment.service.ts`. Locate the `createSubscription` method, specifically the `await this.subscriptionService.create({...})` call (around line 278). `user` is already in scope from the earlier `this.authClient.send(MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID, ...)` call (around line 207).

Add `Language` to the `@cyna-api/common` import. Inside the `subscriptionService.create({...})` object, add:

```typescript
      notificationEmail: user.email,
      notificationLanguage: (user.preferredLanguage as Language) ?? Language.FR,
```

- [ ] **Step 3.9: If `payment.service.spec.ts` exists and tests `createSubscription`, add subscription-snapshot assertions**

Run: `cd cyna-api && grep -l "createSubscription" apps/payment-service/src/services/*.spec.ts 2>&1`

If a matching spec file exists, append:

```typescript
describe('createSubscription notification snapshot', () => {
  it('snapshots user.email and user.preferredLanguage onto the subscription', async () => {
    // Arrange: mock authClient to return a user with preferredLanguage = 'en'
    // Act: service.createSubscription(dto)
    // Assert: subscriptionService.create called with notificationEmail + notificationLanguage = 'en'
    expect(subscriptionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationEmail: 'user@example.com',
        notificationLanguage: 'en',
      }),
    );
  });
});
```

Run: `cd cyna-api && npx jest --testPathPattern=payment.service.spec --testNamePattern='snapshot' -w 1`
Expected: PASS (or FAIL then fix code — the fix in Step 3.8 should already cover it).

- [ ] **Step 3.10: Full test suite sanity check**

Run: `cd cyna-api && npx jest -w 2`
Expected: No previously-passing test now fails (we have only added optional fields).

- [ ] **Step 3.11: Commit**

```bash
cd cyna-api && git add \
  apps/order-service/src/services/order.service.ts \
  apps/order-service/src/services/order.service.spec.ts \
  apps/order-service/src/controllers/order.controller.ts \
  apps/payment-service/src/services/payment.service.ts \
  apps/payment-service/src/services/payment.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(order): snapshot notification context at checkout and subscription creation

Every new Order and Subscription now persists the recipient email and
preferred language at creation time. The controller accepts preferredLanguage
on CREATE_ORDER payloads (populated by the API Gateway from authenticated
user context or the x-lang header for guests). Fallback is 'fr'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Only stage files that actually changed — the spec file is optional depending on Step 3.2.

---

## Task 4: Enrich payment webhook events with notification context

**Files:**

- Modify: `apps/payment-service/src/services/webhook.service.ts`
- Modify: `apps/payment-service/src/services/webhook.service.spec.ts`

This task introduces the most behavioral change. The existing `handlePaymentIntentFailed` today does not emit to `notificationClient` at all — adding the emit closes a hidden bug.

- [ ] **Step 4.1: Read the current webhook.service.ts end-to-end**

Run: `cd cyna-api && cat apps/payment-service/src/services/webhook.service.ts`

Note the seven handler methods: `handlePaymentIntentSucceeded`, `handlePaymentIntentFailed`, `handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionCreated`, `handleSubscriptionDeleted`, `handleChargeRefunded`.

- [ ] **Step 4.2: Add imports to webhook.service.ts**

Add (or extend existing imports) at the top of `apps/payment-service/src/services/webhook.service.ts`:

```typescript
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import {
  EVENT_PATTERNS,
  MESSAGE_PATTERNS,
  Language,
  SubscriptionStatus,
  PaymentConfirmedEvent,
  PaymentFailedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionPastDueEvent,
  SubscriptionCancelledEvent,
  RefundedEvent,
} from '@cyna-api/common';
```

- [ ] **Step 4.3: Add a private helper to resolve an order by payment intent**

Inside the `WebhookService` class, add:

```typescript
  private async resolveOrderByPaymentIntent(
    paymentIntentId: string,
  ): Promise<{
    orderId: string;
    orderNumber: string;
    userId: string | null;
    email: string;
    language: Language;
    total: number;
    currency: string;
    itemsSummary: string;
  } | null> {
    try {
      const order = await firstValueFrom(
        this.orderClient
          .send(MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT, { paymentIntentId })
          .pipe(
            timeout(3000),
            catchError((err) => throwError(() => err)),
          ),
      );
      if (!order) return null;
      const itemsSummary = Array.isArray(order.items)
        ? order.items
            .map(
              (it: { productName?: string; name?: string; quantity?: number }) =>
                `${it.productName ?? it.name ?? 'Item'} x${it.quantity ?? 1}`,
            )
            .join(', ')
        : '';
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId ?? null,
        email: order.notificationEmail ?? order.guestEmail ?? '',
        language: (order.notificationLanguage as Language) ?? Language.FR,
        total: Number(order.totalAmount ?? 0),
        currency: order.currency ?? 'EUR',
        itemsSummary,
      };
    } catch (err) {
      this.logger.error(
        `Failed to resolve order by paymentIntent: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
```

If the exact field names on the `Order` returned by `GET_ORDER_BY_PAYMENT_INTENT` differ (e.g. `total_amount` vs `totalAmount`), adjust using the findings from Step 4.1.

- [ ] **Step 4.4: Enrich handlePaymentIntentSucceeded**

Replace the existing `notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, ...)` call in `handlePaymentIntentSucceeded`. The new body shape:

```typescript
  private async handlePaymentIntentSucceeded(data: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = data.id;
    const amount = data.amount;
    const metadata = data.metadata;

    this.logger.log(`Payment confirmed: ${paymentIntentId}`);

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
      paymentIntentId,
      amount,
      metadata,
    });

    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) {
      this.logger.warn(
        `Skipping notification for paymentIntent ${paymentIntentId}: order not resolved or email missing`,
      );
      return;
    }

    const event: PaymentConfirmedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      total: ctx.total,
      currency: ctx.currency,
      itemsSummary: ctx.itemsSummary,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.CONFIRMED, event);
  }
```

Note: keep the existing `orderClient.emit` — the order service already consumes this pattern to update order status.

- [ ] **Step 4.5: Enrich (and add) handlePaymentIntentFailed notification emit**

Current state: only emits to `orderClient`. Add a notification emit after the order emit:

```typescript
  private async handlePaymentIntentFailed(data: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = data.id;
    const errorMessage = data.last_payment_error?.message ?? 'Payment failed';

    this.logger.log(`Payment failed: ${paymentIntentId}`);

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, {
      paymentIntentId,
      error: errorMessage,
    });

    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) {
      this.logger.warn(
        `Skipping notification for failed paymentIntent ${paymentIntentId}: order not resolved or email missing`,
      );
      return;
    }

    const event: PaymentFailedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      error: errorMessage,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.FAILED, event);
  }
```

- [ ] **Step 4.6: Enrich handleInvoicePaid (subscription renewal)**

The `handleInvoicePaid` handler is called for both initial subscription invoices and renewals. For subscription renewals the local `Subscription` row already carries the snapshot.

```typescript
  private async handleInvoicePaid(data: Stripe.Invoice): Promise<void> {
    const stripeSubId = data.subscription as string | null;
    if (!stripeSubId) return;

    const subscription = await this.subscriptionService.findByStripeId(stripeSubId);
    if (!subscription) {
      this.logger.warn(`Subscription not found for stripeId=${stripeSubId}`);
      return;
    }

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED, {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      productId: subscription.productId,
    });

    if (!subscription.notificationEmail) {
      this.logger.warn(`Skipping renewal email for subscription ${subscription.id}: no notificationEmail`);
      return;
    }

    const event: SubscriptionRenewedEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
      newPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? '',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED, event);
  }
```

Field names for `productName`, `currentPeriodEnd` come from the Subscription entity — verify via `cat apps/payment-service/src/entities/subscription.entity.ts` and adjust if needed. If `productName` is not on Subscription, pass `'Subscription'` as a safe default; do not make a cross-service call here.

- [ ] **Step 4.7: Enrich handleInvoicePaymentFailed (past due)**

```typescript
  private async handleInvoicePaymentFailed(data: Stripe.Invoice): Promise<void> {
    const stripeSubId = data.subscription as string | null;
    if (!stripeSubId) return;

    const subscription = await this.subscriptionService.findByStripeId(stripeSubId);
    if (!subscription) {
      this.logger.warn(`Subscription not found for stripeId=${stripeSubId}`);
      return;
    }

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE, {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      productId: subscription.productId,
    });

    if (!subscription.notificationEmail) return;

    const event: SubscriptionPastDueEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE, event);
  }
```

- [ ] **Step 4.8: Enrich handleSubscriptionCreated**

```typescript
  private async handleSubscriptionCreated(data: Stripe.Subscription): Promise<void> {
    const stripeSubId = data.id;

    const subscription = await this.subscriptionService.findByStripeId(stripeSubId);
    if (!subscription) {
      this.logger.warn(
        `Subscription not found for stripeId=${stripeSubId} (race with createSubscription save)`,
      );
      return;
    }

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED, {
      stripeSubscriptionId: stripeSubId,
      customerId: data.customer as string,
    });

    if (!subscription.notificationEmail) return;

    const item = data.items.data[0];
    const price = item?.price?.unit_amount ?? 0;
    const currency = item?.price?.currency?.toUpperCase() ?? 'EUR';
    const billingPeriod = item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

    const event: SubscriptionCreatedEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
      billingPeriod,
      price: price / 100,
      currency,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED, event);
  }
```

- [ ] **Step 4.9: Enrich handleSubscriptionDeleted (cancellation)**

```typescript
  private async handleSubscriptionDeleted(data: Stripe.Subscription): Promise<void> {
    const stripeSubId = data.id;

    const subscription = await this.subscriptionService.findByStripeId(stripeSubId);
    if (!subscription) return;

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED, {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      productId: subscription.productId,
    });

    if (!subscription.notificationEmail) return;

    const event: SubscriptionCancelledEvent = {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      email: subscription.notificationEmail,
      language: subscription.notificationLanguage ?? Language.FR,
      productName: subscription.productName ?? 'Subscription',
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED, event);
  }
```

- [ ] **Step 4.10: Enrich handleChargeRefunded**

Replace current body (which only emits to `orderClient`):

```typescript
  private async handleChargeRefunded(data: Stripe.Charge): Promise<void> {
    const paymentIntentId = data.payment_intent as string | null;
    if (!paymentIntentId) return;

    const refundAmount = (data.amount_refunded ?? 0) / 100;
    const currency = (data.currency ?? 'EUR').toUpperCase();

    this.orderClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, {
      paymentIntentId,
      refundAmount,
      currency,
    });

    const ctx = await this.resolveOrderByPaymentIntent(paymentIntentId);
    if (!ctx || !ctx.email) return;

    const event: RefundedEvent = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      userId: ctx.userId,
      email: ctx.email,
      language: ctx.language,
      refundAmount,
      currency,
    };
    this.notificationClient.emit(EVENT_PATTERNS.PAYMENT.REFUNDED, event);
  }
```

- [ ] **Step 4.11: Update webhook.service.spec.ts expectations**

Open `apps/payment-service/src/services/webhook.service.spec.ts`.

For the `handlePaymentIntentSucceeded` test: mock `orderClient.send(MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT, …)` to return a valid order with `notificationEmail`, `notificationLanguage`, `orderNumber`, etc. Then assert both `orderClient.emit` and `notificationClient.emit` are called, and the notificationClient payload matches `PaymentConfirmedEvent` shape.

For `handlePaymentIntentFailed`: add a new assertion that `notificationClient.emit` is now called with a `PaymentFailedEvent`.

For `handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionCreated`, `handleSubscriptionDeleted`: mock `subscriptionService.findByStripeId` to return a subscription with snapshot fields populated. Assert `notificationClient.emit` called with the enriched event.

For `handleChargeRefunded`: same pattern as `handlePaymentIntentSucceeded`.

Test skeleton (apply to each handler test block):

```typescript
it('emits enriched PaymentConfirmedEvent to notificationClient', async () => {
  orderClient.send = jest.fn().mockReturnValue(
    of({
      id: 'order-1',
      orderNumber: 'ORD-001',
      userId: 'user-1',
      notificationEmail: 'user@example.com',
      notificationLanguage: 'en',
      totalAmount: 100,
      currency: 'EUR',
      items: [{ productName: 'SOC Pro', quantity: 1 }],
    }),
  );
  await service['handlePaymentIntentSucceeded']({
    id: 'pi_1',
    amount: 10000,
    metadata: {},
  } as Stripe.PaymentIntent);

  expect(notificationClient.emit).toHaveBeenCalledWith(
    EVENT_PATTERNS.PAYMENT.CONFIRMED,
    expect.objectContaining({
      orderId: 'order-1',
      email: 'user@example.com',
      language: 'en',
      itemsSummary: 'SOC Pro x1',
    }),
  );
});
```

- [ ] **Step 4.12: Run webhook tests to confirm pass**

Run: `cd cyna-api && npx jest --testPathPattern=webhook.service.spec -w 1`
Expected: all tests pass (including new notification-emit assertions).

- [ ] **Step 4.13: Full test suite**

Run: `cd cyna-api && npx jest -w 2`
Expected: no regressions.

- [ ] **Step 4.14: Commit**

```bash
cd cyna-api && git add \
  apps/payment-service/src/services/webhook.service.ts \
  apps/payment-service/src/services/webhook.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(payment): enrich payment webhook events with user notification context

Every Stripe webhook handler in WebhookService now emits a typed,
fully-enriched event to notification.queue. Payment-intent events
resolve the order via a single RPC to order-service. Subscription
events read the snapshot from the already-loaded Subscription. A
previously-missing notification emit on payment_intent.payment_failed
and on charge.refunded is now added.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add language to auth event payloads

**Files:**

- Modify: `apps/auth-service/src/events/auth-events.publisher.ts`
- Modify: `apps/auth-service/src/services/auth.service.ts`
- Modify: `apps/auth-service/src/events/auth-events.publisher.spec.ts` (if exists)
- Modify: `apps/auth-service/src/services/auth.service.spec.ts` (if exists)

- [ ] **Step 5.1: Read current emitUserVerified and emitPasswordResetCompleted signatures**

Run: `cd cyna-api && grep -nA 8 'emitUserVerified\|emitPasswordResetCompleted' apps/auth-service/src/events/auth-events.publisher.ts`

- [ ] **Step 5.2: Update emitUserVerified signature**

Change the existing `emitUserVerified(userId: string)` to:

```typescript
  async emitUserVerified(userId: string, email: string, language: Language): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.USER_VERIFIED, {
          userId,
          email,
          language,
        }),
      );
      this.logger.log(`Event emitted: ${EVENT_PATTERNS.AUTH.USER_VERIFIED} for user ${userId}`);
    } catch (err) {
      this.logger.error(
        `Failed to emit USER_VERIFIED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
```

- [ ] **Step 5.3: Update emitPasswordResetCompleted signature**

Change to:

```typescript
  async emitPasswordResetCompleted(
    userId: string,
    email: string,
    language: Language,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.notificationClient.emit(EVENT_PATTERNS.AUTH.PASSWORD_RESET_COMPLETED, {
          userId,
          email,
          language,
          timestamp: new Date(),
        }),
      );
      this.logger.log(
        `Event emitted: ${EVENT_PATTERNS.AUTH.PASSWORD_RESET_COMPLETED} for user ${userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to emit PASSWORD_RESET_COMPLETED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
```

Note: `emitPasswordChanged` already accepts `email` and `language` — do not modify it.

- [ ] **Step 5.4: Update call sites in auth.service.ts**

Open `apps/auth-service/src/services/auth.service.ts`.

At the call site around line 215 (inside email-verification handler):

```typescript
await this.authEventsPublisher.emitUserVerified(
  user.id,
  user.email,
  user.preferredLanguage as Language,
);
```

At the call site around line 373 (inside password-reset completion):

```typescript
await this.authEventsPublisher.emitPasswordResetCompleted(
  user.id,
  user.email,
  user.preferredLanguage as Language,
);
```

Add `Language` to the `@cyna-api/common` import.

- [ ] **Step 5.5: Update publisher tests (if present)**

Run: `cd cyna-api && ls apps/auth-service/src/events/*.spec.ts 2>&1`. If the spec exists and tests `emitUserVerified`/`emitPasswordResetCompleted`, update the test to pass `email` and `language` arguments and assert the full new payload shape.

- [ ] **Step 5.6: Update service tests (if present)**

If `auth.service.spec.ts` verifies `emitUserVerified`/`emitPasswordResetCompleted` are called, update the test to assert new argument shape.

- [ ] **Step 5.7: Run tests**

Run: `cd cyna-api && npx jest --testPathPattern=auth-events|auth.service.spec -w 1`
Expected: all pass.

- [ ] **Step 5.8: Full compile**

Run: `cd cyna-api && npx tsc --noEmit --project tsconfig.json`
Expected: no errors.

- [ ] **Step 5.9: Commit**

```bash
cd cyna-api && git add \
  apps/auth-service/src/events/auth-events.publisher.ts \
  apps/auth-service/src/events/auth-events.publisher.spec.ts \
  apps/auth-service/src/services/auth.service.ts \
  apps/auth-service/src/services/auth.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(auth): include email and language in auth event payloads

emitUserVerified and emitPasswordResetCompleted now carry the recipient
email and preferred language so downstream notification handlers can
render a localized email without a round-trip back to the auth DB.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Stage only files that actually changed.

---

## Task 6: Create PaymentEventsHandler in notification service

**Files:**

- Create: `apps/notification-service/src/handlers/payment-events.handler.ts`
- Modify: `apps/notification-service/src/handlers/handlers.module.ts`

- [ ] **Step 6.1: Read the existing AuthEventsHandler for the exact pattern**

Run: `cd cyna-api && cat apps/notification-service/src/handlers/auth-events.handler.ts`

Note: decorator is `@Controller()`, `@EventPattern(...)` methods wrap the whole body in `try/catch`, errors logged via `CynaLoggerService`, no re-throw. Subjects map is declared inline per handler as `const subjects: Record<Language, string>`.

- [ ] **Step 6.2: Write PaymentEventsHandler**

Create `apps/notification-service/src/handlers/payment-events.handler.ts`:

```typescript
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  EVENT_PATTERNS,
  Language,
  PaymentConfirmedEvent,
  PaymentFailedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionPastDueEvent,
  SubscriptionCancelledEvent,
  RefundedEvent,
  CynaLoggerService,
} from '@cyna-api/common';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

@Controller()
export class PaymentEventsHandler {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext(PaymentEventsHandler.name);
  }

  private baseVars(): { frontendUrl: string; year: number } {
    return {
      frontendUrl: this.configService.get<string>('FRONTEND_URL') ?? '',
      year: new Date().getFullYear(),
    };
  }

  private formatAmount(amount: number, currency: string, language: Language): string {
    const locale = language === Language.EN ? 'en-US' : 'fr-FR';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.CONFIRMED)
  async handlePaymentConfirmed(@Payload() data: PaymentConfirmedEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.CONFIRMED for order ${data.orderId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Confirmation de votre commande ${data.orderNumber}`,
        [Language.EN]: `Your order ${data.orderNumber} is confirmed`,
      };
      const html = this.emailTemplateService.render('order-confirmation', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        total: this.formatAmount(data.total, data.currency, data.language),
        itemsSummary: data.itemsSummary,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.CONFIRMED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.FAILED)
  async handlePaymentFailed(@Payload() data: PaymentFailedEvent): Promise<void> {
    try {
      this.logger.log(`Handling PAYMENT.FAILED for order ${data.orderId} (lang=${data.language})`);
      const subjects: Record<Language, string> = {
        [Language.FR]: `Echec du paiement pour ${data.orderNumber}`,
        [Language.EN]: `Payment failed for order ${data.orderNumber}`,
      };
      const html = this.emailTemplateService.render('payment-failed', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        error: data.error,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.FAILED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED)
  async handleSubscriptionCreated(@Payload() data: SubscriptionCreatedEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.SUBSCRIPTION_CREATED for subscription ${data.subscriptionId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Bienvenue - Abonnement ${data.productName}`,
        [Language.EN]: `Welcome - Subscription ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-welcome', data.language, {
        ...this.baseVars(),
        productName: data.productName,
        billingPeriod: data.billingPeriod,
        price: this.formatAmount(data.price, data.currency, data.language),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_CREATED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED)
  async handleSubscriptionRenewed(@Payload() data: SubscriptionRenewedEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.SUBSCRIPTION_RENEWED for ${data.subscriptionId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Renouvellement de votre abonnement ${data.productName}`,
        [Language.EN]: `Subscription ${data.productName} renewed`,
      };
      const html = this.emailTemplateService.render('subscription-renewal', data.language, {
        ...this.baseVars(),
        productName: data.productName,
        newPeriodEnd: data.newPeriodEnd,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_RENEWED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE)
  async handleSubscriptionPastDue(@Payload() data: SubscriptionPastDueEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.SUBSCRIPTION_PAST_DUE for ${data.subscriptionId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Paiement en attente - ${data.productName}`,
        [Language.EN]: `Payment past due - ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-past-due', data.language, {
        ...this.baseVars(),
        productName: data.productName,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_PAST_DUE for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED)
  async handleSubscriptionCancelled(@Payload() data: SubscriptionCancelledEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.SUBSCRIPTION_CANCELLED for ${data.subscriptionId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Annulation confirmee - ${data.productName}`,
        [Language.EN]: `Subscription cancelled - ${data.productName}`,
      };
      const html = this.emailTemplateService.render('subscription-cancellation', data.language, {
        ...this.baseVars(),
        productName: data.productName,
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.SUBSCRIPTION_CANCELLED for ${data.subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT.REFUNDED)
  async handleRefunded(@Payload() data: RefundedEvent): Promise<void> {
    try {
      this.logger.log(
        `Handling PAYMENT.REFUNDED for order ${data.orderId} (lang=${data.language})`,
      );
      const subjects: Record<Language, string> = {
        [Language.FR]: `Remboursement traite - ${data.orderNumber}`,
        [Language.EN]: `Refund processed - ${data.orderNumber}`,
      };
      const html = this.emailTemplateService.render('refund-confirmation', data.language, {
        ...this.baseVars(),
        orderNumber: data.orderNumber,
        refundAmount: this.formatAmount(data.refundAmount, data.currency, data.language),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle PAYMENT.REFUNDED for order ${data.orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 6.3: Register handler in handlers.module.ts**

Open `apps/notification-service/src/handlers/handlers.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthEventsHandler } from './auth-events.handler';
import { PaymentEventsHandler } from './payment-events.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthEventsHandler, PaymentEventsHandler],
})
export class HandlersModule {}
```

- [ ] **Step 6.4: Type-check**

Run: `cd cyna-api && npx tsc --noEmit --project tsconfig.json`
Expected: no errors.

- [ ] **Step 6.5: Commit**

```bash
cd cyna-api && git add \
  apps/notification-service/src/handlers/payment-events.handler.ts \
  apps/notification-service/src/handlers/handlers.module.ts
git commit -m "$(cat <<'EOF'
feat(notification): add PaymentEventsHandler for order and subscription emails

Adds 7 RabbitMQ @EventPattern handlers in a new PaymentEventsHandler
controller. Each handler renders a localized Handlebars template and
sends the email via the shared EmailService. Amounts are formatted with
Intl.NumberFormat per language. Errors are caught and logged, never
rethrown, so a handler failure does not trigger RMQ requeue storms.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add three new auth event handlers

**Files:**

- Modify: `apps/notification-service/src/handlers/auth-events.handler.ts`

- [ ] **Step 7.1: Read current file**

Run: `cd cyna-api && cat apps/notification-service/src/handlers/auth-events.handler.ts`

- [ ] **Step 7.2: Add imports**

At the top, extend the `@cyna-api/common` import with:

```typescript
import {
  EVENT_PATTERNS,
  Language,
  CynaLoggerService,
  UserVerifiedEvent,
  PasswordChangedEvent,
  PasswordResetCompletedEvent,
} from '@cyna-api/common';
```

- [ ] **Step 7.3: Append three handlers before the class's closing brace**

```typescript
  @EventPattern(EVENT_PATTERNS.AUTH.USER_VERIFIED)
  async handleUserVerified(@Payload() data: UserVerifiedEvent): Promise<void> {
    try {
      this.logger.log(`Handling AUTH.USER_VERIFIED for user ${data.userId}`);
      const subjects: Record<Language, string> = {
        [Language.FR]: 'Bienvenue chez CYNA',
        [Language.EN]: 'Welcome to CYNA',
      };
      const html = this.emailTemplateService.render('welcome', data.language, {
        frontendUrl: this.configService.get<string>('FRONTEND_URL') ?? '',
        year: new Date().getFullYear(),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle AUTH.USER_VERIFIED for user ${data.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_CHANGED)
  async handlePasswordChanged(@Payload() data: PasswordChangedEvent): Promise<void> {
    try {
      this.logger.log(`Handling AUTH.PASSWORD_CHANGED for user ${data.userId}`);
      const subjects: Record<Language, string> = {
        [Language.FR]: 'Votre mot de passe a ete modifie',
        [Language.EN]: 'Your password has been changed',
      };
      const html = this.emailTemplateService.render('password-changed', data.language, {
        frontendUrl: this.configService.get<string>('FRONTEND_URL') ?? '',
        year: new Date().getFullYear(),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle AUTH.PASSWORD_CHANGED for user ${data.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @EventPattern(EVENT_PATTERNS.AUTH.PASSWORD_RESET_COMPLETED)
  async handlePasswordResetCompleted(
    @Payload() data: PasswordResetCompletedEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Handling AUTH.PASSWORD_RESET_COMPLETED for user ${data.userId}`);
      const subjects: Record<Language, string> = {
        [Language.FR]: 'Mot de passe reinitialise',
        [Language.EN]: 'Password reset successful',
      };
      const html = this.emailTemplateService.render('password-reset-success', data.language, {
        frontendUrl: this.configService.get<string>('FRONTEND_URL') ?? '',
        year: new Date().getFullYear(),
      });
      await this.emailService.sendEmail({
        to: data.email,
        subject: subjects[data.language] ?? subjects[Language.FR],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle AUTH.PASSWORD_RESET_COMPLETED for user ${data.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
```

- [ ] **Step 7.4: Type-check**

Run: `cd cyna-api && npx tsc --noEmit --project tsconfig.json`
Expected: no errors.

- [ ] **Step 7.5: Commit**

```bash
cd cyna-api && git add apps/notification-service/src/handlers/auth-events.handler.ts
git commit -m "$(cat <<'EOF'
feat(notification): add P1 auth event handlers for welcome and password changes

Three new @EventPattern handlers on AuthEventsHandler: USER_VERIFIED
(post-verification welcome), PASSWORD_CHANGED (security alert after
authenticated password change), PASSWORD_RESET_COMPLETED (confirmation
after successful reset flow).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Create 20 Handlebars templates

**Files:**

- Create: 10 `.hbs` files in `apps/notification-service/src/templates/fr/`
- Create: 10 `.hbs` files in `apps/notification-service/src/templates/en/`

All templates must include `{{frontendUrl}}` and `{{year}}` references consumed by `base.hbs`. Content is intentionally minimal — visual style matches existing templates. All accents are deliberately removed from the plan source to avoid encoding issues; restore them directly in the template files where appropriate.

- [ ] **Step 8.1: Read an existing template to match styling**

Run: `cd cyna-api && cat apps/notification-service/src/templates/fr/email-verification.hbs`

- [ ] **Step 8.2: Create French templates**

Create each of the following files with the content below.

`apps/notification-service/src/templates/fr/order-confirmation.hbs`:

```handlebars
<h1>Merci pour votre commande</h1>
<p>Votre commande <strong>{{orderNumber}}</strong> a bien ete confirmee.</p>
<p><strong>Contenu :</strong> {{itemsSummary}}</p>
<p><strong>Total :</strong> {{total}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/account?tab=billing'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Voir ma commande</a>
</p>
<p class='hint' style='color: #9ca3af; font-size: 13px;'>Un email de livraison suivra si votre
  commande contient des produits physiques.</p>
```

`apps/notification-service/src/templates/fr/payment-failed.hbs`:

```handlebars
<h1>Paiement echoue</h1>
<p>Le paiement pour la commande <strong>{{orderNumber}}</strong> n'a pas abouti.</p>
<p><strong>Raison :</strong> {{error}}</p>
<p>Vous pouvez reessayer votre commande depuis votre espace client.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/account?tab=billing'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Reessayer</a>
</p>
```

`apps/notification-service/src/templates/fr/subscription-welcome.hbs`:

```handlebars
<h1>Bienvenue - {{productName}}</h1>
<p>Votre abonnement <strong>{{productName}}</strong> est desormais actif.</p>
<p><strong>Periode de facturation :</strong> {{billingPeriod}}</p>
<p><strong>Tarif :</strong> {{price}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Gerer mon abonnement</a>
</p>
```

`apps/notification-service/src/templates/fr/subscription-renewal.hbs`:

```handlebars
<h1>Abonnement renouvele</h1>
<p>Votre abonnement <strong>{{productName}}</strong> a ete renouvele avec succes.</p>
<p><strong>Nouvelle periode jusqu'au :</strong> {{newPeriodEnd}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Voir mon abonnement</a>
</p>
```

`apps/notification-service/src/templates/fr/subscription-past-due.hbs`:

```handlebars
<h1>Paiement en attente</h1>
<p>Le renouvellement de votre abonnement
  <strong>{{productName}}</strong>
  n'a pas pu etre traite.</p>
<p>Merci de mettre a jour votre moyen de paiement pour eviter toute interruption de service.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Mettre a jour</a>
</p>
```

`apps/notification-service/src/templates/fr/subscription-cancellation.hbs`:

```handlebars
<h1>Abonnement annule</h1>
<p>Votre abonnement <strong>{{productName}}</strong> a ete annule.</p>
<p>L'acces reste actif jusqu'a la fin de la periode deja payee.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Voir mon abonnement</a>
</p>
```

`apps/notification-service/src/templates/fr/refund-confirmation.hbs`:

```handlebars
<h1>Remboursement traite</h1>
<p>Le remboursement pour la commande <strong>{{orderNumber}}</strong> a ete traite.</p>
<p><strong>Montant :</strong> {{refundAmount}}</p>
<p>Le delai de mise a disposition sur votre moyen de paiement depend de votre banque.</p>
```

`apps/notification-service/src/templates/fr/welcome.hbs`:

```handlebars
<h1>Bienvenue chez CYNA</h1>
<p>Votre compte est desormais verifie. Vous pouvez acceder a l'ensemble de nos solutions de
  cybersecurite.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Acceder au dashboard</a>
</p>
```

`apps/notification-service/src/templates/fr/password-changed.hbs`:

```handlebars
<h1>Mot de passe modifie</h1>
<p>Votre mot de passe a ete modifie avec succes.</p>
<p>Si vous n'etes pas a l'origine de cette action, reinitialisez immediatement votre mot de passe et
  contactez notre support.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/auth/forgot-password'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Reinitialiser</a>
</p>
```

`apps/notification-service/src/templates/fr/password-reset-success.hbs`:

```handlebars
<h1>Mot de passe reinitialise</h1>
<p>Votre mot de passe a bien ete reinitialise. Vous pouvez maintenant vous connecter avec votre
  nouveau mot de passe.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/auth/login'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Se connecter</a>
</p>
```

- [ ] **Step 8.3: Create English templates**

`apps/notification-service/src/templates/en/order-confirmation.hbs`:

```handlebars
<h1>Thank you for your order</h1>
<p>Your order <strong>{{orderNumber}}</strong> is confirmed.</p>
<p><strong>Items:</strong> {{itemsSummary}}</p>
<p><strong>Total:</strong> {{total}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/account?tab=billing'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >View my order</a>
</p>
<p class='hint' style='color: #9ca3af; font-size: 13px;'>A shipping notification will follow if your
  order contains physical products.</p>
```

`apps/notification-service/src/templates/en/payment-failed.hbs`:

```handlebars
<h1>Payment failed</h1>
<p>The payment for order <strong>{{orderNumber}}</strong> did not go through.</p>
<p><strong>Reason:</strong> {{error}}</p>
<p>You can retry your order from your account.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/account?tab=billing'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Retry</a>
</p>
```

`apps/notification-service/src/templates/en/subscription-welcome.hbs`:

```handlebars
<h1>Welcome - {{productName}}</h1>
<p>Your <strong>{{productName}}</strong> subscription is now active.</p>
<p><strong>Billing period:</strong> {{billingPeriod}}</p>
<p><strong>Price:</strong> {{price}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Manage subscription</a>
</p>
```

`apps/notification-service/src/templates/en/subscription-renewal.hbs`:

```handlebars
<h1>Subscription renewed</h1>
<p>Your <strong>{{productName}}</strong> subscription has been renewed successfully.</p>
<p><strong>Next period ends:</strong> {{newPeriodEnd}}</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >View subscription</a>
</p>
```

`apps/notification-service/src/templates/en/subscription-past-due.hbs`:

```handlebars
<h1>Payment past due</h1>
<p>We could not renew your <strong>{{productName}}</strong> subscription.</p>
<p>Please update your payment method to avoid any service interruption.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Update payment</a>
</p>
```

`apps/notification-service/src/templates/en/subscription-cancellation.hbs`:

```handlebars
<h1>Subscription cancelled</h1>
<p>Your <strong>{{productName}}</strong> subscription has been cancelled.</p>
<p>Access remains active until the end of your current paid period.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard/subscriptions'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >View subscription</a>
</p>
```

`apps/notification-service/src/templates/en/refund-confirmation.hbs`:

```handlebars
<h1>Refund processed</h1>
<p>The refund for order <strong>{{orderNumber}}</strong> has been processed.</p>
<p><strong>Amount:</strong> {{refundAmount}}</p>
<p>The time to see the funds back on your payment method depends on your bank.</p>
```

`apps/notification-service/src/templates/en/welcome.hbs`:

```handlebars
<h1>Welcome to CYNA</h1>
<p>Your account is verified. You can now access all our cybersecurity solutions.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/dashboard'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Go to dashboard</a>
</p>
```

`apps/notification-service/src/templates/en/password-changed.hbs`:

```handlebars
<h1>Password changed</h1>
<p>Your password has been changed successfully.</p>
<p>If this was not you, reset your password immediately and contact our support.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/auth/forgot-password'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Reset password</a>
</p>
```

`apps/notification-service/src/templates/en/password-reset-success.hbs`:

```handlebars
<h1>Password reset successful</h1>
<p>Your password has been reset. You can now sign in with your new password.</p>
<p style='text-align: center;'>
  <a
    href='{{frontendUrl}}/auth/login'
    class='button'
    style='display: inline-block; background-color: #4f39f6 !important; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 24px 0;'
  >Sign in</a>
</p>
```

- [ ] **Step 8.4: Sanity check templates render without error**

Start the notification-service in dev mode briefly to confirm template loading:

```bash
cd cyna-api && timeout 5 npx nest start notification-service --watch 2>&1 | head -30
```

Expected: no "template not found" errors at startup. (The `EmailTemplateService` loads all templates at init time.)

- [ ] **Step 8.5: Commit**

```bash
cd cyna-api && git add apps/notification-service/src/templates
git commit -m "$(cat <<'EOF'
feat(notification): add fr and en email templates for payment and auth events

20 new Handlebars templates: 10 for the payment and auth flows added in
this branch, each in French and English. Templates extend the shared
base layout and match the visual style of the existing three templates.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Unit tests for the new handlers

**Files:**

- Create: `apps/notification-service/src/handlers/payment-events.handler.spec.ts`
- Modify: `apps/notification-service/src/handlers/auth-events.handler.spec.ts`

- [ ] **Step 9.1: Read existing AuthEventsHandler spec to match style**

Run: `cd cyna-api && cat apps/notification-service/src/handlers/auth-events.handler.spec.ts`

- [ ] **Step 9.2: Write PaymentEventsHandler spec**

Create `apps/notification-service/src/handlers/payment-events.handler.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Language, CynaLoggerService } from '@cyna-api/common';
import { PaymentEventsHandler } from './payment-events.handler';
import { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email/email-template.service';

describe('PaymentEventsHandler', () => {
  let handler: PaymentEventsHandler;
  let emailService: jest.Mocked<EmailService>;
  let emailTemplateService: jest.Mocked<EmailTemplateService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsHandler,
        {
          provide: EmailService,
          useValue: { sendEmail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EmailTemplateService,
          useValue: { render: jest.fn().mockReturnValue('<html>rendered</html>') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://app.cyna.test') },
        },
        {
          provide: CynaLoggerService,
          useValue: { setContext: jest.fn(), log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
      ],
    }).compile();

    handler = module.get(PaymentEventsHandler);
    emailService = module.get(EmailService);
    emailTemplateService = module.get(EmailTemplateService);
  });

  describe('handlePaymentConfirmed', () => {
    it('renders order-confirmation in the payload language', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        total: 100,
        currency: 'EUR',
        itemsSummary: 'SOC Pro x1',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'order-confirmation',
        Language.EN,
        expect.objectContaining({
          orderNumber: 'ORD-001',
          itemsSummary: 'SOC Pro x1',
          frontendUrl: 'https://app.cyna.test',
        }),
      );
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com' }),
      );
    });

    it('falls back to French subject when language is unknown', async () => {
      await handler.handlePaymentConfirmed({
        orderId: 'o-2',
        orderNumber: 'ORD-002',
        userId: null,
        email: 'guest@example.com',
        language: 'de' as Language,
        total: 50,
        currency: 'EUR',
        itemsSummary: 'Item x1',
      });
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('Confirmation') }),
      );
    });

    it('swallows EmailService failures without throwing', async () => {
      emailService.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(
        handler.handlePaymentConfirmed({
          orderId: 'o-3',
          orderNumber: 'ORD-003',
          userId: 'u-3',
          email: 'user@example.com',
          language: Language.FR,
          total: 10,
          currency: 'EUR',
          itemsSummary: 'Item x1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('handlePaymentFailed', () => {
    it('renders payment-failed in the payload language', async () => {
      await handler.handlePaymentFailed({
        orderId: 'o-4',
        orderNumber: 'ORD-004',
        userId: 'u-4',
        email: 'user@example.com',
        language: Language.FR,
        error: 'Card declined',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'payment-failed',
        Language.FR,
        expect.objectContaining({ orderNumber: 'ORD-004', error: 'Card declined' }),
      );
    });
  });

  describe('handleSubscriptionCreated', () => {
    it('renders subscription-welcome with formatted price', async () => {
      await handler.handleSubscriptionCreated({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        productName: 'SOC Pro',
        billingPeriod: 'monthly',
        price: 49,
        currency: 'EUR',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'subscription-welcome',
        Language.EN,
        expect.objectContaining({ productName: 'SOC Pro', billingPeriod: 'monthly' }),
      );
    });
  });

  describe('handleSubscriptionRenewed', () => {
    it('renders subscription-renewal', async () => {
      await handler.handleSubscriptionRenewed({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        productName: 'SOC Pro',
        newPeriodEnd: '2026-05-01T00:00:00.000Z',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'subscription-renewal',
        Language.FR,
        expect.objectContaining({ newPeriodEnd: '2026-05-01T00:00:00.000Z' }),
      );
    });
  });

  describe('handleSubscriptionPastDue', () => {
    it('renders subscription-past-due', async () => {
      await handler.handleSubscriptionPastDue({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.EN,
        productName: 'SOC Pro',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'subscription-past-due',
        Language.EN,
        expect.objectContaining({ productName: 'SOC Pro' }),
      );
    });
  });

  describe('handleSubscriptionCancelled', () => {
    it('renders subscription-cancellation', async () => {
      await handler.handleSubscriptionCancelled({
        subscriptionId: 's-1',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        productName: 'SOC Pro',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'subscription-cancellation',
        Language.FR,
        expect.objectContaining({ productName: 'SOC Pro' }),
      );
    });
  });

  describe('handleRefunded', () => {
    it('renders refund-confirmation with formatted amount', async () => {
      await handler.handleRefunded({
        orderId: 'o-1',
        orderNumber: 'ORD-001',
        userId: 'u-1',
        email: 'user@example.com',
        language: Language.FR,
        refundAmount: 100,
        currency: 'EUR',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'refund-confirmation',
        Language.FR,
        expect.objectContaining({ orderNumber: 'ORD-001' }),
      );
    });
  });
});
```

- [ ] **Step 9.3: Run the new spec**

Run: `cd cyna-api && npx jest --testPathPattern=payment-events.handler.spec -w 1`
Expected: PASS.

- [ ] **Step 9.4: Extend auth-events.handler.spec.ts**

Open `apps/notification-service/src/handlers/auth-events.handler.spec.ts`. Append three describe blocks at the end:

```typescript
describe('handleUserVerified', () => {
  it('renders welcome template in the payload language', async () => {
    await handler.handleUserVerified({
      userId: 'u-1',
      email: 'user@example.com',
      language: Language.EN,
    });
    expect(emailTemplateService.render).toHaveBeenCalledWith(
      'welcome',
      Language.EN,
      expect.objectContaining({ frontendUrl: expect.any(String) }),
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });
});

describe('handlePasswordChanged', () => {
  it('renders password-changed template in the payload language', async () => {
    await handler.handlePasswordChanged({
      userId: 'u-1',
      email: 'user@example.com',
      language: Language.FR,
      timestamp: new Date(),
    });
    expect(emailTemplateService.render).toHaveBeenCalledWith(
      'password-changed',
      Language.FR,
      expect.anything(),
    );
  });
});

describe('handlePasswordResetCompleted', () => {
  it('renders password-reset-success template', async () => {
    await handler.handlePasswordResetCompleted({
      userId: 'u-1',
      email: 'user@example.com',
      language: Language.EN,
      timestamp: new Date(),
    });
    expect(emailTemplateService.render).toHaveBeenCalledWith(
      'password-reset-success',
      Language.EN,
      expect.anything(),
    );
  });
});
```

Reuse the `handler`, `emailService`, `emailTemplateService` variable names from the existing test's `beforeEach`. If variable names differ, adapt.

- [ ] **Step 9.5: Run the extended spec**

Run: `cd cyna-api && npx jest --testPathPattern=auth-events.handler.spec -w 1`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 9.6: Full suite**

Run: `cd cyna-api && npx jest -w 2`
Expected: no regressions.

- [ ] **Step 9.7: Commit**

```bash
cd cyna-api && git add \
  apps/notification-service/src/handlers/payment-events.handler.spec.ts \
  apps/notification-service/src/handlers/auth-events.handler.spec.ts
git commit -m "$(cat <<'EOF'
test(notification): add unit tests for payment and auth notification handlers

Jest unit tests covering all 7 new payment handlers and 3 new auth
handlers. Each handler is tested for: template selection per language,
recipient resolution, and graceful error swallowing when EmailService
throws.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Run code reviewer and security auditor in parallel, then triage findings

**Files:** none directly — this task generates a review plan and potentially triggers fixes in earlier tasks.

- [ ] **Step 10.1: Confirm the branch state is clean**

Run: `cd cyna-api && git status && git log --oneline main..HEAD`
Expected: working tree clean, 9 new commits on the branch (1 spec + 8 code commits).

- [ ] **Step 10.2: Dispatch `code-reviewer` and `security-auditor` agents in parallel**

The orchestrator launches both agents in a single message with both Agent tool calls.

Code reviewer prompt (summary):

- Review the full diff `main..feat/email-notifications-i18n`
- Check: clean code, no duplication, strict TypeScript (no `any`), CLAUDE.md compliance (NestJS microservices patterns, TypeORM, cookie rules, no HTTP between services), DRY/YAGNI
- Output: categorized findings (must-fix / should-fix / nice-to-have)

Security auditor prompt (summary):

- Review the full diff `main..feat/email-notifications-i18n`
- Specifically check: secrets or PII in logs (note pre-existing `email.service.ts:54` issue — out of scope but flag), Handlebars auto-escaping preserved (no `{{{...}}}` on user input), Stripe webhook signature verification unchanged, email header injection risk on the `to` field, rate limiting assumptions unchanged
- Output: risk-rated findings

- [ ] **Step 10.3: Consolidate findings into a triage list**

For each finding:

- `must-fix`: open a new ad-hoc task in the plan, fix, retest, commit as `fix(scope): …`.
- `should-fix`: same, but discuss with user first if time-critical.
- `nice-to-have`: defer, document in the PR description.

- [ ] **Step 10.4: Apply fixes**

For each must-fix finding, the orchestrator:

1. Reads the affected file.
2. Applies the fix.
3. Runs affected tests.
4. Commits with a descriptive `fix(...)` message.

- [ ] **Step 10.5: Final test run**

Run: `cd cyna-api && npx jest -w 2 && npx tsc --noEmit --project tsconfig.json`
Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 10.6: Final git log sanity**

Run: `cd cyna-api && git log --oneline main..HEAD`
Expected: readable history — each commit should stand on its own. No push.

---

## Out-of-scope (tracked for follow-up, not in this branch)

- Frontend fixes in `cyna-app`: `RegisterRequest` missing `preferredLanguage`, `CreatePaymentIntent` / `CreateSubscriptionRequest` missing `language`. Without these, new users and new orders will default to `'fr'` via the handler fallback. Handled on a separate branch in the `cyna-app` repo after this branch is merged.
- API Gateway checkout controller: pass `preferredLanguage` into the `CREATE_ORDER` RPC payload. Order service already accepts it (Task 3) — gateway wiring is a one-liner but belongs in a separate PR with the frontend changes since they are paired.
- `email.service.ts:54` logs the recipient email — pre-existing. Flagged by security auditor, deferred to a dedicated PR.
- `base.hbs` footer hard-codes French ("Tous droits reserves", "Solutions de cybersecurite"). Shared layout not yet i18n'd. Deferred.
- P2 emails (admin notifications for contact messages, low stock, admin login) — deferred.
- Shipping events (`ORDER.SHIPPED`, `ORDER.DELIVERED`) — deferred, pipeline not wired.

---

## Final state

After this plan executes successfully:

- Branch `feat/email-notifications-i18n` has 9+ commits on top of `main`, all local, no push.
- 10 new customer-facing emails are wired end-to-end with fr/en templates.
- Every new `Order` and `Subscription` carries its own notification context — renewal emails many months later will still land in the correct language.
- All tests pass, TypeScript is clean, code reviewer and security auditor signed off.
- User makes the merge/push decision; the orchestrator does not.
