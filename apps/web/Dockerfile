# syntax=docker/dockerfile:1
ARG NODE_VERSION=MUST_SET_NODE_VERSION_BUILD_ARG
ARG APP_NAME=MUST_SET_APP_NAME

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat bash
RUN : "${PNPM_VERSION:?PNPM_VERSION build-arg is required, e.g. --build-arg PNPM_VERSION=10.32.1}" \
    && corepack enable pnpm && corepack install -g "pnpm@${PNPM_VERSION}"

FROM base AS pruner
WORKDIR /app
COPY . .
ARG APP_NAME
RUN pnpm dlx turbo@latest prune ${APP_NAME} --docker

FROM base AS installer
WORKDIR /app
# better-sqlite3 requires Python and build tools to compile native addons
RUN apk add --no-cache python3 make g++
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=installer /app .
COPY --from=pruner /app/out/full/ .
# Plain pnpm instead of turbo: turbo is only used above for prune. There is no
# remote cache here, so running through turbo adds complexity of turbo.json's
# environment variables handling for example with no benefit.
ARG APP_NAME
RUN --mount=type=secret,id=env_build,target=/tmp/.env.build \
    if [ -s /tmp/.env.build ]; then \
      set -a && . /tmp/.env.build && set +a; \
    fi \
    && pnpm --filter=${APP_NAME} run build

FROM node:${NODE_VERSION}-alpine AS runner
ARG APP_NAME
WORKDIR /app
# npm ships in the base image but standalone Next.js output never calls it —
# remove it (and its bundled tar/sigstore/picomatch/etc CVEs) rather than
# carrying an unused attack surface into production.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack

# libstdc++ is required at runtime for better-sqlite3's compiled native addon
# (it's linked against it during the g++ build in the installer stage, but a
# fresh alpine image doesn't have it unless you install it here)
RUN apk add --no-cache bash libstdc++
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# The postbuild script (next-standalone-postbuild) already copies:
#   .next/static → .next/standalone/apps/web/.next/static
#   public/      → .next/standalone/apps/web/public
# So the standalone dir is self-contained — one COPY covers everything.
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/package.json ./
# Next.js standalone output is copied to the root of /app, but package.json's "start"
# script expects to run "node .next/standalone/apps/web/server.js". We create a symlink
# so that the expected nested path correctly maps back to the root of our /app directory.
RUN mkdir -p .next && ln -s /app .next/standalone

USER nextjs
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000
CMD ["node", "--run", "start"]
