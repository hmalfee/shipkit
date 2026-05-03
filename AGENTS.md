# MentoMark Agent Instructions

## Architecture & Boundaries
- **Monorepo**: Uses `pnpm` workspaces and Turborepo.
- `apps/web`: Next.js App Router frontend (runs on port 3001). Next.js config has `reactCompiler` (avoids need for manual `useMemo`/`useCallback`) and `typedRoutes` enabled.
- `apps/server`: Hono backend running on Node.js via `@hono/node-server` on port 3000.
- `packages/db`: Drizzle ORM with PostgreSQL.
- `packages/ui`: Shared UI components utilizing `shadcn/ui`.
- `packages/auth`: Better Auth integrated with Polar (`@polar-sh/better-auth`).
- `packages/env`: Environment variable validation utilizing `@t3-oss/env-core`.

## Development Workflow
- **Start Everything**: Run `pnpm dev` at the root.
- **Backend/DB Init**: Starting the server (`pnpm predev:server` runs automatically during dev) spins up the local PostgreSQL database via `docker compose up -d` located in `apps/server/docker-compose.yml`.
- **Type Checking**: Run `pnpm check-types` from the root to run `tsc` across workspaces. There is no root `lint` or `test` script currently configured.

## Database & Drizzle Quirks
- Execute Drizzle commands directly from the root using Turborepo mappings:
  - `pnpm db:push`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`
- **Important Configuration**: `packages/db/drizzle.config.ts` explicitly loads environment variables from `../../apps/server/.env`. Make sure `apps/server/.env` is configured with `DATABASE_URL` when interacting with the database schema.

## UI & Styling
- **Tailwind CSS v4**: The project uses Tailwind v4. There is no `tailwind.config.js|ts`. Configuration happens via standard CSS files (e.g., `packages/ui/src/styles/globals.css`).
- **shadcn/ui**: Components live in `packages/ui/src/components`. `apps/web` is configured to map `@mento-mark/ui/*` directly to the `packages/ui` source. 

## Auth & Environment Variables
- **Env Validation**: Env variables are strictly validated. If you add a new environment variable, you must update the Zod schemas in `packages/env/src/server.ts` or `packages/env/src/web.ts`, then add it to `apps/server/.env` or `apps/web/.env`. Next.js validates these at build time by importing `@mento-mark/env/web` in `next.config.ts`.
- **Auth URLs**: The server validates auth at `env.BETTER_AUTH_URL`, while the web client hits `env.NEXT_PUBLIC_SERVER_URL` via `apps/web/src/lib/auth-client.ts`. Backend mounts Better Auth on `/api/auth/*`.
