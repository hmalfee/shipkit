# Sandbox

A local virtualization harness providing the tools to run a true-to-production deployment pipeline locally.

The sandbox spins up **two virtual server instances (VMs)** on a private Docker bridge network (`shipkit-sandbox`):

1. **`dokploy-server` (`dokploy`)**: Emulates the target deployment server (VPS).
    - Runs Dokploy UI/API, Traefik, Postgres, Redis, and SSH server (port 22).
    - Hosts the local Docker Registry (`:5000`) and Registry UI (`:5001`).
2. **`runner-server` (`runner`)**: Emulates a GitHub-hosted runner (`ubuntu-latest`).
    - Runs an isolated Docker-in-Docker daemon (no host ports exposed).
    - Has [`act`](https://nektosact.com) pre-installed; executes workflow jobs entirely inside the container.

---

## Why a Dedicated Runner VM Instead of the Host Machine?

Instead of running `act` directly against your host machine's Docker engine, we isolate the runner inside a virtualized container (`runner-server` via DinD):

- **True-to-CI Isolation**: Replicates a fresh, isolated `ubuntu-latest` VM with its own loopback (`127.0.0.1`) and network stack.
- **Port & Tunnel Safety**: SSH tunnels (`127.0.0.1:3000` / `:5000`) bind inside the runner container without colliding with host ports.
- **Clean Host**: All build caches, dangling layers, and test artifacts stay contained in Docker volumes rather than polluting your workstation.

---

## Quick Start

### 1. Start the Sandbox

Starts both the Dokploy server and GitHub runner instances:

```sh
pnpm sandbox start
```

- **Dokploy Dashboard:** [http://localhost:3000](http://localhost:3000) (Login: `admin@dokploy.local` / `dokploy-admin-pw`)
- **Docker Registry UI:** [http://localhost:5001](http://localhost:5001)

**Prerequisites:** `docker` and `tar` must be on your host `PATH` (checked automatically before each run).

### 2. Run a CI Workflow Locally

Run any workflow from `.github/workflows/` inside the runner instance:

```sh
# Prompts an interactive menu to choose from available workflows
pnpm sandbox run-act

# Or pass a workflow file name directly (e.g. .github/workflows/deploy.yml)
pnpm sandbox run-act deploy
```

### 3. Stop the Sandbox

```sh
# Stop containers (preserves state and images for next start)
pnpm sandbox stop

# Or stop and remove containers & networks
pnpm sandbox stop --rm
```

---

## Commands & Flags

### `pnpm sandbox start`

| Option                      | Default | Description                                     |
| --------------------------- | ------- | ----------------------------------------------- |
| `--dokploy-port <port>`     | `3000`  | Host port for Dokploy dashboard and API         |
| `--registry-ui-port <port>` | `5001`  | Host port for Docker registry UI                |
| `--clean`                   | `false` | Wipe Dokploy database and state before starting |

### `pnpm sandbox stop`

| Option | Default | Description                                           |
| ------ | ------- | ----------------------------------------------------- |
| `--rm` | `false` | Remove containers and network (volumes are preserved) |

### `pnpm sandbox run-act [<workflow>]`

| Option                    | Default             | Description                                                                                                                                       |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<workflow>`              | _(prompt)_          | Workflow file name from `.github/workflows/` (without `.yml`). If omitted, prompts an interactive list of all available workflows to choose from. |
| `--ref <branch>`          | `HEAD`              | Branch name to simulate (e.g. `staging`, `main`)                                                                                                  |
| `--event <name>`          | `workflow_dispatch` | GitHub event trigger                                                                                                                              |
| `--use-cache`             | `false`             | **Fast iteration only**: skip cold runner reset (reuses cached layers, not true-to-CI)                                                            |
| `--disable-actions-cache` | `false`             | Don't start the cache server (`actions/cache` steps become no-ops)                                                                                |
| `--secrets-from-apps-env` | `false`             | Automatically load secrets from `apps/*/.env` files                                                                                               |
| `--env-from <path>`       | _none_              | Load additional environment variables from file                                                                                                   |
| `--secrets-from <path>`   | _none_              | Load additional secrets from file                                                                                                                 |
| `--env KEY=VALUE`         | _none_              | Set an individual environment variable                                                                                                            |
| `--secret KEY=VALUE`      | _none_              | Set an individual secret                                                                                                                          |

> [!TIP]
> **Understanding `--use-cache`**: Real GitHub Actions runners always spin up as clean, fresh VMs with zero pre-existing cache. By default, `run-act` mirrors this faithfully by resetting `runner-server` to a cold state before every job. Use `--use-cache` only when you are in a tight debugging loop and need fast turnaround. Avoid relying on `--use-cache` for final deployment verification.

> [!NOTE]
> **`actions/cache` persistence**: The `runner-cache` Docker volume (`/root/.cache/act-cache` inside the runner) stores `actions/cache` artifacts and persists across runs and sandbox restarts — independent of `--use-cache`. To clear it: `docker volume rm shipkit-sandbox_runner-cache`.

---

## How It Works

1. **Bootstrap & Key Exchange**:
    - Generates a local SSH keypair at `~/.cache/shipkit-sandbox/id_ed25519`.
    - Injects the public key into `dokploy-server` (`/root/.ssh/authorized_keys`).
    - Automatically initializes an admin account and caches an API token at `/tmp/dokploy-server.apikey`.
2. **Workflow Execution**:
    - Runs your workflow against a git snapshot of your working tree (including uncommitted changes, excluding ignored files) inside the runner VM. Injects `SSH_HOST=dokploy`, `SSH_KEY`, and `DOKPLOY_API_KEY` so workflows can connect to `dokploy-server` via SSH, push images, and complete deployments.
