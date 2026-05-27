# Mento Mark - AI Agent Instructions

This document provides essential context and rules for AI agents operating within the `mento-mark` repository. Please read and adhere to these guidelines to ensure consistency across the monorepo.

## 1. Monorepo Architecture & Turborepo Rules

This project is a monorepo utilizing `pnpm` workspaces (`apps/*`, `packages/*`, `tooling/*`) and Turborepo for task orchestration.

### 1.1 Workspace-Specific Commands

- **Local Scope:** Command configurations must be defined strictly within their respective workspace directories, not at the root level.
- **`turbo.json` per Package:** Each package or app must create and maintain its own `turbo.json` to declare its tasks.
- **Root Level Restrictions:** Workspace-specific commands **must not** be placed at the root level. The root `package.json` and `turbo.json` files are strictly reserved for global, repository-wide commands such as:
    - `build`
    - `dev`
    - `lint`
    - `format`
    - `typecheck`
    - `clean`
