# Email Notifications & i18n — Design Spec

**Date:** 2026-04-16
**Branch:** `feat/email-notifications-i18n`
**Repo scope:** `cyna-api` only (frontend fixes tracked in a separate branch on `cyna-app`)
**Drivers:** Two bugs reported in production test — (1) no email is sent on purchase, (2) all emails arrive in English regardless of user preference.

---

## 1. Problem

The Notification Service infrastructure exists (Nodemailer + Handlebars, RabbitMQ event consumption, fr/en template folders) and three flows are functional: email verification, password reset, and admin 2FA codes.

However:

- **19+ RabbitMQ events are defined and emitted** by Auth, Payment, Order, Catalog and Content services, but **only 3 have handlers** in the Notification Service. All other events reach the queue and are silently dropped.
- **Payment and subscription webhooks emit events without user context** (`userId`, `email`, `language` are absent from payloads). Even if handlers existed, they would have no way to pick a language or a recipient.
- **Auth events that include user context do not pass `language`** except for the three wired flows.

The net customer-facing effects are exactly the bugs reported:

- No confirmation email on payment success, no alert on payment failure, no welcome on subscription creation, no receipt on renewal.
- Even the working flows fall back to the default language (`'fr'` in `email-template.service.ts:76`) instead of honoring the user's `preferredLanguage` — unless the sender passes it explicitly.

## 2. Scope (P0 + P1)

### Customer-facing emails to add

| Priority | Event                            | Template                    | Trigger                                     |
| -------- | -------------------------------- | --------------------------- | ------------------------------------------- |
| P0       | `PAYMENT.CONFIRMED`              | `order-confirmation`        | Stripe `payment_intent.succeeded`           |
| P0       | `PAYMENT.FAILED`                 | `payment-failed`            | Stripe `payment_intent.payment_failed`      |
| P0       | `PAYMENT.SUBSCRIPTION_CREATED`   | `subscription-welcome`      | Stripe `customer.subscription.created`      |
| P0       | `PAYMENT.SUBSCRIPTION_RENEWED`   | `subscription-renewal`      | Stripe `invoice.paid` on recurring          |
| P1       | `PAYMENT.SUBSCRIPTION_PAST_DUE`  | `subscription-past-due`     | Stripe `invoice.payment_failed`             |
| P1       | `PAYMENT.SUBSCRIPTION_CANCELLED` | `subscription-cancellation` | Stripe `customer.subscription.deleted`      |
| P1       | `PAYMENT.REFUNDED`               | `refund-confirmation`       | Stripe `charge.refunded`                    |
| P1       | `AUTH.USER_VERIFIED`             | `welcome`                   | After successful email verification click   |
| P1       | `AUTH.PASSWORD_CHANGED`          | `password-changed`          | After password change by authenticated user |
| P1       | `AUTH.PASSWORD_RESET_COMPLETED`  | `password-reset-success`    | After successful password reset             |

10 templates × 2 languages (fr, en) = 20 template files.

### Out of scope (deferred to future work)

- P2 admin-facing emails: `CONTENT.CONTACT_MESSAGE_RECEIVED`, `CATALOG.STOCK_LOW`, `AUTH.ADMIN_LOGIN`.
- P2 low-priority user emails: `AUTH.USER_LOGIN` (new-device alerts), `AUTH.ACCOUNT_DELETED`.
- Shipping events (`ORDER.SHIPPED`, `ORDER.DELIVERED`) — not emitted today, no physical fulfillment pipeline yet.
- Integration tests with real RabbitMQ/SMTP — unit tests only for this iteration.
- Frontend changes (register/checkout/subscribe payloads not passing `language` and `preferredLanguage`) — handled on a dedicated branch in `cyna-app`.

## 3. Design

### 3.1 Snapshot pattern for notification context

**Principle:** at the moment an `Order` or a `Subscription` is created, freeze the notification context — recipient email and preferred language — onto the entity. All subsequent notifications tied to that entity read from this snapshot, not from the live `User` record.

**Rationale:**

- The payment webhook runs on Stripe's clock. Chained cross-service lookups (payment → order → auth → user) on the webhook path would add fragility and retry risk. With the snapshot in place, payment needs only a single hop to order to retrieve the fully-enriched notification context.
- Subscription renewals fire months after creation with zero frontend interaction. The snapshot is the only available source for language at renewal time.
- Temporal consistency: the confirmation matches the intent of the order as placed, even if the user later changes their language preference.
- Guest checkout already stores `guestEmail` on `Order`; the snapshot pattern simply generalizes it to all orders and adds `preferredLanguage`.

### 3.2 Data model changes

**`Order` entity** — add:

- `email: string` (canonical recipient; for authenticated users, copied from `User.email` at checkout; for guests, copied from `guestEmail` field)
- `preferredLanguage: 'fr' | 'en'` (copied from `User.preferredLanguage` for authenticated users; from the `x-lang` header for guests; fallback `'fr'`)

**`Subscription` entity** — add the same two columns. Populated at subscription creation time.

**Migration:**

- Name: `XXXXXXXX-add-email-language-to-orders-subscriptions.ts`
- Forward: add columns, backfill existing rows by joining on `userId` → `User.email` / `User.preferredLanguage`, fallback `'fr'` when `User` cannot be resolved (e.g., pre-existing guest orders using `guestEmail`).
- Reverse: drop columns.

### 3.3 Event enrichment flow

```
Stripe Webhook
  ↓
API Gateway (webhooks/webhook.controller.ts)
  ↓ emit PAYMENT.WEBHOOK_RECEIVED
Payment Service (webhook.service.ts)
  ↓ resolves orderId or subscriptionId from Stripe metadata
  ↓ queries OrderClient to fetch { email, preferredLanguage }
  ↓ emit PAYMENT.<event> with enriched payload
RabbitMQ
  ↓
Notification Service
  ↓ PaymentEventsHandler.<handler>
  ↓ EmailTemplateService.render(template, language, data)
  ↓ EmailService.send()
```

For AUTH events, enrichment is trivial: the Auth Service already loads the `User` entity in the handler that emits the event. We add `email` and `preferredLanguage` to the event payload where missing.

### 3.4 Typed event contracts

Introduce DTO interfaces in `libs/common/src/events/` so both publisher and handler depend on the same shape:

- `payment-events.dto.ts` — `PaymentConfirmedEvent`, `PaymentFailedEvent`, `SubscriptionCreatedEvent`, `SubscriptionRenewedEvent`, `SubscriptionPastDueEvent`, `SubscriptionCancelledEvent`, `RefundedEvent`
- `auth-events.dto.ts` — `UserVerifiedEvent`, `PasswordChangedEvent`, `PasswordResetCompletedEvent` (extends existing where relevant)

Every event shape includes the enriched fields `userId | guestEmail`, `email`, `language`.

### 3.5 Handlers organization

**New file:** `apps/notification-service/src/handlers/payment-events.handler.ts`

Seven `@EventPattern(...)` handlers, one per P0+P1 payment event. Each:

1. Validates payload shape (typed DTO).
2. Resolves template name + data model.
3. Calls `EmailTemplateService.render(template, payload.language, data)`.
4. Calls `EmailService.send({ to: payload.email, subject, html })`.
5. Logs success/failure without ever logging the recipient email address or any payment amount.

**Extended file:** `apps/notification-service/src/handlers/auth-events.handler.ts`

Three new `@EventPattern(...)` handlers for `USER_VERIFIED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_COMPLETED`, following the same shape as the existing three handlers.

**Module registration:** `apps/notification-service/src/handlers/handlers.module.ts` imports the new `PaymentEventsHandler`.

### 3.6 Templates

Location: `apps/notification-service/src/templates/{fr,en}/`

All templates extend the shared `layouts/base.hbs` layout already used by the three existing templates. Each template:

- Uses the same CTA button style as existing templates (visual consistency).
- Never embeds secrets (payment intent IDs, full card numbers, raw amounts without formatting).
- Formats amounts with the appropriate locale (`€1 234,56` for fr, `€1,234.56` for en).

### 3.7 Logging & observability

- All handlers log at `log` level on success with `{ event, orderId | subscriptionId, language }`.
- Errors log at `error` level with stack trace.
- **Never log:** `email`, `amount`, `paymentIntentId`, Stripe customer IDs, names, addresses.
- A failed email send does not retry or republish the event — it logs and moves on. Rationale: at-least-once delivery with the current RMQ ack model would require idempotency, which is out of scope for this iteration.

### 3.8 Error handling

- If the payment webhook cannot resolve the order/subscription (`OrderClient` returns null), the event is **not emitted to notification** — the error is logged and the webhook still returns 200 to Stripe. The order state remains authoritative; the missing email is a degraded-mode side-effect, not a critical failure.
- If `EmailService.send()` throws (SMTP down), the handler catches the exception internally, logs it at error level, and returns normally. Because exceptions never bubble out of the `@EventPattern` handler, NestJS auto-acks the RMQ message and no requeue storm occurs. Recovery is manual or via a future dead-letter strategy.
- Unknown `language` values in the payload default to `'fr'` at the template service level (already implemented).

### 3.9 Testing

Jest unit tests, one `.spec.ts` per new file of logic:

- `payment-events.handler.spec.ts` — for each handler: build a valid payload, mock `EmailTemplateService` and `EmailService`, assert both are called with the expected args (template name, language, recipient). Include a case with `language: 'en'` and one with `language: 'fr'` per handler.
- `auth-events.handler.spec.ts` — extend existing with the three new handlers, same shape.
- `webhook.service.spec.ts` — for each of the enriched events: mock `OrderClient`, assert the emitted payload contains `email`, `language`, `userId | guestEmail`.
- `checkout.service.spec.ts` — assert snapshot fields populated on `Order` creation (authenticated and guest paths).
- `subscription.service.spec.ts` — idem for `Subscription` creation.
- `email-template.service.spec.ts` — verify `'fr'` fallback when language is unknown.

No integration tests in this iteration. No changes to existing tests unless they break from signature changes (entity adds are additive).

## 4. Files to create or modify

**Create:**

- `apps/notification-service/src/handlers/payment-events.handler.ts`
- `apps/notification-service/src/handlers/payment-events.handler.spec.ts`
- `libs/common/src/events/payment-events.dto.ts`
- `libs/common/src/events/auth-events.dto.ts` (may already exist — extend if so)
- `apps/order-service/src/migrations/XXXXXXXX-add-email-language-to-orders-subscriptions.ts`
- 20 `.hbs` template files under `apps/notification-service/src/templates/{fr,en}/`

**Modify:**

- `apps/order-service/src/entities/order.entity.ts`
- `apps/order-service/src/entities/subscription.entity.ts`
- `apps/order-service/src/services/checkout.service.ts`
- `apps/order-service/src/services/subscription.service.ts`
- `apps/payment-service/src/services/webhook.service.ts`
- `apps/auth-service/src/events/auth-events.publisher.ts`
- `apps/notification-service/src/handlers/auth-events.handler.ts`
- `apps/notification-service/src/handlers/handlers.module.ts`
- associated `.spec.ts` files

## 5. Commit strategy

Atomic commits, one per logical layer, English messages per CLAUDE.md convention:

1. `feat(order): add email and preferredLanguage snapshot to Order and Subscription entities`
2. `feat(order): snapshot notification context at checkout and subscription creation`
3. `feat(payment): enrich payment webhook events with user notification context`
4. `feat(auth): include language in auth event payloads for notification handlers`
5. `feat(notification): add PaymentEventsHandler for order and subscription emails`
6. `feat(notification): add P1 auth event handlers for welcome and password changes`
7. `feat(notification): add fr and en email templates for payment and auth events`
8. `test(notification): add unit tests for payment and auth notification handlers`

**No push. No PR.** Work stays local on `feat/email-notifications-i18n` until explicit approval.

## 6. Team orchestration

| Role              | Agent                        | Responsibility                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend Architect | `feature-dev:code-architect` | Produce a code-level implementation blueprint from this spec before any code is written. Advisory only — does not edit files.                                                                                                                            |
| Code Reviewer     | `code-reviewer`              | Review the branch diff for clean code, type strictness, no duplication, CLAUDE.md compliance (NestJS microservices patterns, TypeORM, cookie rules). Runs after all implementation commits.                                                              |
| Security Auditor  | `security-auditor`           | Review the branch diff for secrets in logs, Handlebars injection via unescaped user input, preservation of Stripe webhook signature verification, email header injection, rate-limiting on sensitive endpoints. Runs in parallel with the code reviewer. |

The orchestrator (Claude) executes all file writes and commits directly. Agents never edit files in this flow — they advise, review, and report.

## 7. Non-goals

- Idempotency of email sends across RMQ redelivery — out of scope.
- Email delivery tracking, bounce handling, unsubscribe links — out of scope.
- A/B testing of templates — out of scope.
- Migration of existing emails to a different template engine — out of scope.
