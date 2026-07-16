# shipkit

A production-ready, full-stack **TypeScript** starter template — built to help you ship fast without cutting corners on production readiness. Auth, database, observability, and tooling are wired up from day one, so you can focus on building your product instead of your infrastructure.

## Tech Stack

**Frontend**

- [Next.js](https://nextjs.org) (App Router) — React framework
- [TanStack Query](https://tanstack.com/query) — server state & data fetching
- [TanStack Form](https://tanstack.com/form) — type-safe forms
- [Tailwind CSS](https://tailwindcss.com) v4 — utility-first styling
- [shadcn/ui](https://ui.shadcn.com) — accessible, unstyled UI primitives

**Backend**

- [Hono](https://hono.dev) — fast, lightweight web framework
- [oRPC](https://orpc.unnoq.com) — end-to-end type-safe APIs with OpenAPI support
- [Zod](https://zod.dev) — schema validation

**Database**

- [Drizzle ORM](https://orm.drizzle.team) — type-safe SQL ORM
- [PostgreSQL](https://www.postgresql.org) — primary database
- [Redis](https://redis.io) — caching & session storage

**Auth**

- [better-auth](https://www.better-auth.com) — modern authentication for TypeScript

**Observability**

- [OpenTelemetry](https://opentelemetry.io) — unified tracing, metrics & error monitoring for both frontend and backend
- [LogTape](https://logtape.org) — structured logging
- [PostHog](https://posthog.com) — product analytics

**Tooling**

- [Turborepo](https://turbo.build) + [pnpm](https://pnpm.io) workspaces — monorepo build system
- [oxlint](https://oxc.rs) — fast linting
- [Prettier](https://prettier.io) — code formatting
- [Knip](https://knip.dev) — unused code & dependency detection
- TypeScript strict mode across the entire stack

## Quick Start

**Prerequisites:** Node.js 22.x, pnpm 10.x

1. **Install dependencies**

    ```bash
    pnpm install
    ```

2. **Set up environment variables**

    Copy `.env.example` to `.env` in the root and in each app/package that needs it.

3. **Start the dev server**

    ```bash
    pnpm dev
    ```

    This spins up Postgres, Redis, the Hono API, and the Next.js frontend together.

## Project Structure

```
apps/
  server/   → Hono API (oRPC + better-auth)
  web/      → Next.js frontend
packages/
  auth/     → better-auth configuration
  db/       → Drizzle schema, Postgres & Redis clients
  shared/   → shared oRPC contracts & Zod schemas
  ui/       → shadcn/ui component library
  telemetry/→ OpenTelemetry, logging & Sentry setup
tooling/
  scripts/  → internal CLI utilities (port management, git hooks, etc.)
  ...       → shared TypeScript, oxlint & Prettier configs
```

## Scripts

Run from the repository root:

| Command       | Description                                 |
| ------------- | ------------------------------------------- |
| `pnpm dev`    | Start all apps and their dependencies       |
| `pnpm build`  | Build all apps and packages via Turborepo   |
| `pnpm check`  | Run format check, lint, typecheck, and knip |
| `pnpm format` | Format the codebase with Prettier           |
| `pnpm lint`   | Lint the codebase with oxlint               |

## Database

Schema files live in `packages/db/src/pg/schema/`.

```bash
pnpm --filter @shipkit/db db:push         # push schema changes to your database
pnpm --filter @shipkit/db studio:postgres # open Drizzle Studio
```

## UI Components

Add new [shadcn/ui](https://ui.shadcn.com) components via the `ui` package:

```bash
pnpm --filter @shipkit/ui ui:add [component]
```
