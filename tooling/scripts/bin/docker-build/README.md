# docker-build

A wrapper around `docker build` that ensures a clean working tree and automatically passes useful build arguments and secrets to your app's Dockerfile.

## Usage

```sh
pnpm docker-build [--cache-ref= < app-name > [--build-env-file= < path > ] < image-ref > ]
```

## Arguments

- `<app-name>`: The name of the app in `apps/` to build (e.g., `web`).
- `--build-env-file`: _(Optional)_ Path to an `.env` file to inject as a build secret.
    - You can use `{APP_FOLDER}` in the path, which will dynamically reference the app's directory.
    - Example: `--build-env-file={APP_FOLDER}/.env`
- `--cache-ref`: _(Optional)_ Registry image reference to use as a BuildKit cache backend to persist build layers across CI runs.
    - Example: `--cache-ref=registry.example.com/myapp/web:buildcache`

## How it works

1. It searches the `apps/` directory to find an app that matches the `<app-name>` argument.
2. It looks for a `Dockerfile` inside that app's directory.
3. It creates a temporary clean git tree (in the system's temp directory) to avoid sending ignored files to the Docker daemon.
4. **Crucial:** The `docker build` command is executed from the **root of the monorepo**, so the build context contains the entire clean repository, not just the app folder.
5. It automatically injects the following arguments into the Docker build:
    - `--build-arg NODE_VERSION` (extracted from the root `package.json` engines field)
    - `--build-arg PNPM_VERSION` (extracted from the root `package.json` packageManager field)
    - `--build-arg APP_NAME` (the `<app-name>` argument)

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
