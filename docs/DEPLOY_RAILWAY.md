# Railway deployment — cyna-api

The monorepo ships a single multi-stage `Dockerfile` parameterised by
`SERVICE`. Each Railway service in the project deploys the same repo
with its own build argument and env vars.

## Per-service Railway configuration

| Service                | `SERVICE` build arg    | HTTP port           | Notes                                                                 |
| ---------------------- | ---------------------- | ------------------- | --------------------------------------------------------------------- |
| `api-gateway`          | `api-gateway`          | `$PORT` (e.g. 3000) | Primary HTTP edge, exposes `/api/v1/*`, `/webhooks/stripe`, `/health` |
| `auth-service`         | `auth-service`         | `$PORT` (3001)      | Hybrid: RMQ `auth.queue` + `/health`                                  |
| `user-service`         | `user-service`         | `$PORT` (3005)      | Hybrid: RMQ `user.queue` + `/health`                                  |
| `catalog-service`      | `catalog-service`      | `$PORT` (3002)      | Hybrid: RMQ `catalog.queue` + `/health`                               |
| `order-service`        | `order-service`        | `$PORT` (3003)      | Hybrid: RMQ `order.queue` + `/health`                                 |
| `payment-service`      | `payment-service`      | `$PORT` (3004)      | Hybrid: RMQ `payment.queue` + `/health`                               |
| `notification-service` | `notification-service` | `$PORT` (3006)      | Hybrid: RMQ `notification.emails` + `/health`                         |
| `content-service`      | `content-service`      | `$PORT` (3007)      | Hybrid: RMQ `content.queue` + `/health`                               |
| `analytics-service`    | `analytics-service`    | `$PORT` (3008)      | Hybrid: RMQ `analytics.queue` + `/health`                             |

## Railway service settings (per service)

In each Railway service:

- **Builder**: Dockerfile
- **Dockerfile path**: `/Dockerfile`
- **Build args**: `SERVICE=<one of the values above>`
- **Healthcheck path**: `/health`
- **Healthcheck timeout**: 100s (Railway default is fine)

## Required environment variables

Shared across services:

- `RABBITMQ_URL` — `amqp://user:pass@host:5672`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`
- `NODE_ENV=production`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`

`payment-service` only:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

`notification-service` only:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`

`api-gateway` only:

- `CORS_ORIGINS=https://app.cyna.com,https://backoffice.cyna.com`
- `SWAGGER_ENABLED=false` (enforced anyway in production)

## Local build sanity-check

```bash
# From cyna-api/
docker build --build-arg SERVICE=auth-service -t cyna/auth-service .
docker run --rm -p 3001:3001 \
  -e RABBITMQ_URL=amqp://guest:guest@host.docker.internal:5672 \
  cyna/auth-service

# Probe healthcheck
curl http://localhost:3001/health
# => {"status":"ok","service":"auth-service",...}
```

## Healthcheck contract

Every service exposes `GET /health` returning `200 OK` with:

```json
{
  "status": "ok",
  "service": "<service-name>",
  "timestamp": "2026-05-14T12:00:00.000Z",
  "uptime": 123
}
```

The api-gateway additionally exposes `/ready` (RMQ connectivity) and
`/live` (liveness only) — see `apps/api-gateway/src/health/`.
