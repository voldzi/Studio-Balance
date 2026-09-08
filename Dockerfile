# syntax=docker/dockerfile:1.8

FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN apk upgrade --no-cache
RUN corepack enable && corepack prepare pnpm@11.26.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
ARG APP_ENV=local
ARG PUBLIC_APP_URL=http://localhost:3000
ENV APP_ENV=$APP_ENV
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL
COPY . .
RUN pnpm generate:contracts \
  && pnpm --filter @studiobalance/domain build \
  && pnpm --filter @studiobalance/api build \
  && pnpm --filter @studiobalance/web build \
  && pnpm --filter @studiobalance/worker build

FROM builder AS api-deploy
RUN pnpm deploy --filter @studiobalance/api --prod --legacy /production/api

FROM builder AS worker-deploy
RUN pnpm deploy --filter @studiobalance/worker --prod --legacy /production/worker

FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS web-runtime
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
RUN mkdir -p /app/apps/web/.next/cache && chown node:node /app/apps/web/.next/cache
USER node
CMD ["node", "apps/web/server.js"]

FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS api-runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=api-deploy /production/api ./
COPY --from=builder /workspace/infra/postgres/migrations /app/infra/postgres/migrations
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
USER node
CMD ["node", "dist/main.js"]

FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS worker-runtime
ENV NODE_ENV=production
WORKDIR /app/apps/worker
COPY --from=worker-deploy /production/worker ./
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
USER node
CMD ["node", "dist/main.js"]
