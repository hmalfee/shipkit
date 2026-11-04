# CI Workflows

Two workflows ship with this repo. Both talk to a self-hosted Dokploy instance
over SSH and are designed to run unattended on GitHub Actions.

---

## Workflows

### `deploy.yml` — Deploy to Dokploy via SSH

Triggered by `workflow_dispatch` (push to `main`/`staging` is disabled by
default). Detects affected apps with Turbo, builds Docker images, pushes them
to the private registry, then tells Dokploy to deploy each one.

### `staging-teardown.yml` — Stop Staging Environment

Triggered by `workflow_dispatch` or when the `staging` PR is merged. Finds the
staging project in Dokploy and stops it.

---

## VM / infrastructure requirements

| Requirement           | Detail                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| Dokploy               | Running on the VM's host network, port **3000**                                      |
| Docker registry       | Dokploy compose service bound to host port **5000**                                  |
| SSH access            | Port **22**, `root` login, key-based auth only                                       |
| Cloudflare Zero Trust | Sits in front of Dokploy's public URL — workflows bypass it entirely via SSH tunnels |

### Why SSH tunnels instead of the public URL

Dokploy sits behind Cloudflare Zero Trust. Although Dokploy is bypassable with
tokens, the Docker registry and Postgres are private (not exposed to the
internet at all), so SSH port-forwarding is the only option:

- **Dokploy API** → `ssh -L 3000:localhost:3000`; Dokploy binds to the VM's host network.
- **Docker registry** → same approach (`-L 5000:localhost:5000`); the registry
  is a Dokploy compose app bound to the host port. Forwarding to `127.0.0.1`
  makes Docker treat it as insecure/HTTP automatically — no `daemon.json`
  changes needed. (Binding Dokploy's service to a host port is not recommended
  for regular apps; used here intentionally.)
- **Postgres** → double jump: SSH into the host, then `docker exec` into the
  Dokploy container, since Postgres is only reachable from inside the Swarm
  network.

---

## Required secrets

### `deploy.yml`

| Secret            | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `SSH_KEY`         | Private key for the deploy user (PEM or base64-encoded PEM) |
| `SSH_HOST`        | Hostname or IP of the VM                                    |
| `DOKPLOY_API_KEY` | Dokploy API key with project/app/compose permissions        |
| `BASE_DOMAIN`     | Root domain for app URLs (e.g. `example.com`)               |

All other repository secrets are forwarded as app environment variables
(anything that does not match `GITHUB_TOKEN`, `SSH_*`, `DOKPLOY_*`, or
`REGISTRY_*` is included).

### `staging-teardown.yml`

| Secret            | Description           |
| ----------------- | --------------------- |
| `SSH_KEY`         | Same key as above     |
| `SSH_HOST`        | Same host as above    |
| `DOKPLOY_API_KEY` | Same API key as above |
