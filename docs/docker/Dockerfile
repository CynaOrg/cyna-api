# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the NestJS monorepo. The same image recipe
# builds any of the 9 services by passing `--build-arg SERVICE=<name>`
# at build time (e.g. SERVICE=api-gateway, SERVICE=auth-service, etc.).
#
# Stages:
#   1. deps    — production + dev dependencies for the build step
#   2. build   — runs `nest build <SERVICE>` and prunes to prod deps
#   3. runtime — distroless-ish Alpine with only dist + node_modules
#
# Local build example:
#   docker build --build-arg SERVICE=auth-service -t cyna/auth-service .
#   docker run --rm -e RABBITMQ_URL=... -p 3001:3001 cyna/auth-service

ARG NODE_VERSION=22

# ----------------------------------------------------------------------
# Stage 1 — Install dependencies (cached layer)
# ----------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Copy lockfile + manifest first so the dependency layer is cached
# independently of source changes.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ----------------------------------------------------------------------
# Stage 2 — Build the requested service
# ----------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

ARG SERVICE
RUN test -n "$SERVICE" || (echo "ERROR: --build-arg SERVICE is required" && exit 1)

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# nest CLI is in devDeps; build the single requested app
RUN npx nest build "$SERVICE"

# Prune dev dependencies so the runtime stage only carries production deps
RUN npm prune --omit=dev

# ----------------------------------------------------------------------
# Stage 3 — Minimal runtime image
# ----------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ARG SERVICE
ENV NODE_ENV=production \
    SERVICE_NAME=${SERVICE}

# Run as non-root for defence-in-depth
RUN addgroup -S cyna && adduser -S cyna -G cyna

COPY --from=build --chown=cyna:cyna /app/node_modules ./node_modules
COPY --from=build --chown=cyna:cyna /app/dist ./dist
COPY --from=build --chown=cyna:cyna /app/package.json ./package.json

USER cyna

# Railway sets $PORT at runtime; each service's main.ts reads it for
# the /health HTTP listener. RMQ services exit if RABBITMQ_URL is unset.
# The api-gateway also reads PORT for its primary HTTP listener.
EXPOSE 3000

# Shell form so $SERVICE_NAME is expanded by the entrypoint shell.
CMD ["sh", "-c", "node dist/apps/$SERVICE_NAME/main"]
