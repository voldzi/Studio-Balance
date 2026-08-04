# syntax=docker/dockerfile:1.8

FROM node:24.19.0-alpine AS dependencies
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm generate:contracts \
  && pnpm --filter @studiobalance/api build \
  && pnpm --filter @studiobalance/web build \
  && pnpm --filter @studiobalance/worker build

FROM builder AS api-deploy
RUN pnpm deploy --filter @studiobalance/api --prod --legacy /production/api

FROM builder AS worker-deploy
RUN pnpm deploy --filter @studiobalance/worker --prod --legacy /production/worker

FROM node:24.19.0-alpine AS web-runtime
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public
USER node
CMD ["node", "apps/web/server.js"]

FROM node:24.19.0-alpine AS api-runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=api-deploy /production/api ./
COPY --from=builder /workspace/infra/postgres/migrations /app/infra/postgres/migrations
USER node
CMD ["node", "dist/main.js"]

FROM node:24.19.0-alpine AS worker-runtime
ENV NODE_ENV=production
WORKDIR /app/apps/worker
COPY --from=worker-deploy /production/worker ./
USER node
CMD ["node", "dist/main.js"]
