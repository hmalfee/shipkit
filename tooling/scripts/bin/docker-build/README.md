# docker-build

A wrapper around `docker build` that ensures a clean working tree and automatically passes useful build arguments and secrets to your app's Dockerfile.

## Usage

<!-- prettier-ignore -->
```sh
pnpm docker-build <app-name> [--build-env-file=<path>] [--cache-ref=<image-ref>] [--push-ref=<image-ref>] [--cache-from-ref=<image-ref>]
```

## Arguments

- `<app-name>`: The name of the app in `apps/` to build (e.g., `web`).
- `--build-env-file`: _(Optional)_ Path to an `.env` file to inject as a build secret.
    - You can use `{APP_FOLDER}` in the path, which will dynamically reference the app's directory.
    - Example: `--build-env-file={APP_FOLDER}/.env`
- `--cache-ref`: _(Optional)_ Registry image reference to use as a BuildKit cache backend to persist build layers across CI runs.
    - Example: `--cache-ref=registry.example.com/myapp/web:buildcache`
- `--push-ref`: _(Optional)_ Full registry image reference to stream the built image to directly.
    - When provided, the image streams straight to the registry via BuildKit — skips local daemon load/decompress/recompress.
    - When omitted, the image loads into the local Docker daemon as `<app-name>`, so you can run or inspect it locally (`docker run <app-name>`).
    - Use `--push-ref` in CI; omit it for local development runs where you want the image available in your local daemon.
- `--cache-from-ref`: _(Optional)_ Additional read-only registry cache source (e.g. the `main` branch cache).
    - Used as a warm-up fallback when the branch-specific cache is cold (e.g. a new feature branch).
    - Example: `--cache-from-ref=registry.example.com/myapp/web:buildcache-main`

## How it works

1. It searches the `apps/` directory to find an app that matches the `<app-name>` argument.
2. It looks for a `Dockerfile` inside that app's directory.
3. It creates a temporary clean git tree (in the system's temp directory) to avoid sending ignored files to the Docker daemon.
4. **Crucial:** The `docker build` command is executed from the **root of the monorepo**, so the build context contains the entire clean repository, not just the app folder.
5. It automatically injects the following arguments into the Docker build:
    - `--build-arg NODE_VERSION` (extracted from the root `package.json` engines field)
    - `--build-arg PNPM_VERSION` (extracted from the root `package.json` packageManager field)
    - `--build-arg TURBO_VERSION` (extracted from the root `package.json` devDependencies field)
    - `--build-arg APP_NAME` (the app name being built)
    - `--build-arg ENV_HASH` (SHA-256 of the env file, when `--build-env-file` is provided — invalidates cached layers when env changes)

## Writing a Dockerfile for this script

Your Dockerfile (e.g., `apps/web/Dockerfile`) has the facility to use the injected args. You do not have to use them, but they are available if you declare them using `ARG`.

**Important Context Note:** Because the build context is the root of the monorepo, commands like `COPY . .` will copy the entire monorepo, and copying specific app files requires prefixing paths (e.g., `COPY apps/${APP_NAME}/package.json .`).

### Example minimal Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
ARG APP_NAME

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g "pnpm@${PNPM_VERSION}"

# To use the optional build environment secret:
RUN --mount=type=secret,id=env_build,target=/tmp/.env.build \
    if [ -s /tmp/.env.build ]; then \
      set -a && . /tmp/.env.build && set +a; \
    fi \
    && pnpm --filter=${APP_NAME} run build
```
