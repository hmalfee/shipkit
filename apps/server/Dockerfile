# syntax=docker/dockerfile:1
ARG NODE_VERSION=MUST_SET_NODE_VERSION_BUILD_ARG
ARG APP_NAME=MUST_SET_APP_NAME

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat bash
RUN : "${PNPM_VERSION:?PNPM_VERSION build-arg is required}" \
    && corepack enable pnpm && corepack install -g "pnpm@${PNPM_VERSION}"

FROM base AS pruner
WORKDIR /app
COPY . .
ARG APP_NAME
ARG TURBO_VERSION
RUN pnpm dlx turbo@${TURBO_VERSION} prune ${APP_NAME} --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --frozen-lockfile \
    --network-concurrency=64 \
    --config.trustLockfile=true \
    --config.audit=false

FROM base AS builder
WORKDIR /app
COPY --from=installer /app .
COPY --from=pruner /app/out/full/ .
ARG APP_NAME
# No --mount=type=secret: env vars are runtime-only for this non-Next.js app
RUN pnpm --filter=${APP_NAME} run build

FROM node:${NODE_VERSION}-alpine AS runner
ARG APP_NAME
WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 server

COPY --from=builder --chown=server:nodejs /app/apps/${APP_NAME}/dist ./dist
COPY --from=builder --chown=server:nodejs /app/apps/${APP_NAME}/package.json ./

USER server
ENV PORT=3000
EXPOSE 3000
CMD ["node", "--run", "start"]
