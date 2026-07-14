# shipkit

A full-stack TypeScript starter template built for speed, type safety, and great developer experience.

## Tech Stack

- **API:** Hono + oRPC (OpenAPI mode) + Zod
- **Frontend:** Next.js (App Router) + TanStack Query + oRPC client
- **Database:** Drizzle ORM + PostgreSQL + Redis
- **Auth:** better-auth
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Observability:** OpenTelemetry + LogTape (OTel SemConv logger)
- **Tooling:** pnpm workspaces, Turborepo, oxlint, Prettier, TypeScript strict

## Quick Start

1. **Install dependencies**

    ```bash
    pnpm install
    ```

2. **Set up environment variables**
   Copy `.env.example` to `.env` in the root and respective apps/packages.

3. **Start development server**
    ```bash
    pnpm dev
    ```

## Development Commands

Run these from the repository root:

- `pnpm dev` - Starts all apps and dependent packages
- `pnpm build` - Builds all apps and packages via Turborepo
- `pnpm check` - Runs format checking, linting, typechecking, and knip
- `pnpm format` - Formats the codebase with Prettier
- `pnpm lint` - Runs oxlint across the entire repo

## Database

Schema files are located in `packages/db/src/pg/schema/`.

- `pnpm --filter @shipkit/db db:push` - Pushes schema changes to your database
- `pnpm --filter @shipkit/db studio:postgres` - Opens Drizzle Studio

## UI Components

Add new shadcn components using the UI package:

```bash
pnpm --filter @shipkit/ui ui:add [component]
```
