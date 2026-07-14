# Tooling

This workspace contains internal developer tools, CLI utilities, and base configurations for the monorepo.

**Philosophy:** Packages in this directory are meant to improve the developer experience, orchestrate internal workflows, or provide reusable configuration presets. They are intended strictly for internal monorepo use.

## Package Types

### 1. Configurations & Presets (e.g., `ts-config`, `oxlint-config`, `prettier-config`)

These packages export shared rules and setups to ensure consistency across the monorepo. They do **not** bundle the underlying execution tools.

**Usage:**

1. **Install the required tool** in your consumer package (e.g., `typescript`, `oxlint`, `prettier`).
2. **Install the config package** as a dev dependency (e.g., `@shipkit/ts-config`).
3. **Extend or import the preset** in your local configuration file according to the tool's standard mechanism.

### 2. Internal Utilities & CLIs (e.g., `ports`)

These packages provide executable developer tools and automation scripts that orchestrate local environments, manage infrastructure, or handle monorepo-wide tasks.

**Usage:**
These utilities can be executed directly via the CLI, hooked into `package.json` scripts, or consumed programmatically by other packages within the monorepo.
