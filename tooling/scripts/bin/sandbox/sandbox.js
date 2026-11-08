import os from 'node:os';
import path from 'node:path';

import { $, chalk, echo, fs, spinner } from 'zx';

import { dokploy as dp } from '../../lib/dokploy/index.js';

// Ports
export const DEFAULT_DOKPLOY_PORT = 3000;
export const DEFAULT_REGISTRY_UI_PORT = 5001;
// Top-level Sandbox project
const SANDBOX_PROJECT = 'shipkit-sandbox';
const COMPOSE_DIR = path.join(os.tmpdir(), 'shipkit-sandbox');
const COMPOSE_FILE = path.join(COMPOSE_DIR, 'compose.yml');
const DOCKERFILE = path.join(COMPOSE_DIR, 'Dockerfile');
// 1. Dokploy Instance (Deployment Server VM)
const DOKPLOY_SERVICE = 'dokploy';
const DOKPLOY_CONTAINER = 'dokploy-server';
export const DOKPLOY_HOST = DOKPLOY_SERVICE; // compose-network DNS name
const DOKPLOY_IMAGE = 'shipkit/dokploy-server:local';
const DOKPLOY_DATA_VOLUME = `${SANDBOX_PROJECT}_dokploy-data`;
const DOKPLOY_ADMIN_EMAIL = 'admin@dokploy.local';
const DOKPLOY_ADMIN_PASSWORD = 'dokploy-admin-pw';
const DOKPLOY_APIKEY_FILE = path.join(os.tmpdir(), 'dokploy-server.apikey');
// 2. Runner Instance (GitHub Actions Runner VM)
const RUNNER_SERVICE = 'runner';
const RUNNER_CONTAINER = 'runner-server';
const RUNNER_DOCKERD_PORT = 2375; // container side only; host side is ephemeral
export const JOB_IMAGE = 'catthehacker/ubuntu:act-latest';
// Inter-VM SSH keypair: generated once, stored in user cache
const CI_SSH_KEY_FILE = path.join(
    os.homedir(),
    '.cache',
    'shipkit-sandbox',
    'id_ed25519',
);

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

// Pre-bakes SSH access and Dokploy installer prerequisites (`curl`, `iproute2`).
// `apk upgrade` runs first to resolve an Alpine openssh-client conflict when
// installing `openssh`. SSH host keys and sshd configuration (key-based root
// login, TCP forwarding) are set up at build time.
const DOCKERFILE_CONTENT = `FROM docker:27-dind
RUN apk upgrade --no-cache \\
 && apk add --no-cache openssh curl iproute2 \\
 && ssh-keygen -A \\
 && echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config \\
 && echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config \\
 && sed -i 's/^AllowTcpForwarding no/AllowTcpForwarding yes/g' /etc/ssh/sshd_config
`;

// The host ports are injected through DOKPLOY_PORT and
// REGISTRY_UI_PORT so the compose file itself stays static. Only the host side
// is configurable; the container side is always the DEFAULT_*_PORT value.
const COMPOSE_YAML = `services:
    ${DOKPLOY_SERVICE}:
        image: ${DOKPLOY_IMAGE}
        build:
            context: .
            dockerfile: Dockerfile
        container_name: ${DOKPLOY_CONTAINER}
        hostname: ${DOKPLOY_SERVICE}
        restart: 'no'
        privileged: true
        stop_grace_period: 30s
        healthcheck:
            test:
                [
                    'CMD-SHELL',
                    'wget --spider -q http://localhost:3000 || exit 1',
                ]
            interval: 3s
            timeout: 5s
            retries: 10000
            start_period: 20s
        environment:
            - DOCKER_TLS_CERTDIR=
            # Public half of the CI SSH keypair; passed in by compose().
            - CI_SSH_PUBKEY
        ports:
            - '\${DOKPLOY_PORT:-${DEFAULT_DOKPLOY_PORT}}:${DEFAULT_DOKPLOY_PORT}'
            - '444:443'
            - '81:80'
            - '\${REGISTRY_UI_PORT:-${DEFAULT_REGISTRY_UI_PORT}}:${DEFAULT_REGISTRY_UI_PORT}'
        volumes:
            - dokploy-data:/var/lib/docker
            - dokploy-etc:/etc/dokploy
        command:
            - sh
            - -c
            - |
                set -e
                export DOCKER_HOST=unix:///var/run/docker.sock
                mkdir -p /root/.ssh
                echo "$$CI_SSH_PUBKEY" > /root/.ssh/authorized_keys
                chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
                /usr/sbin/sshd
                dockerd-entrypoint.sh &
                DOCKERD_PID=$$!
                trap 'kill $$DOCKERD_PID; wait $$DOCKERD_PID' TERM INT
                echo "Waiting for Dokploy inner Docker daemon..."
                i=0
                until docker info >/dev/null 2>&1; do
                  i=$$((i+1))
                  echo "Not ready yet (attempt $$i)..."
                  sleep 1
                done
                echo "Dokploy inner Docker daemon is ready."
                if [ ! -f /var/lib/docker/.dokploy-installed ]; then
                  echo "Installing Dokploy (first run)..."
                  rm -f /.dockerenv
                  curl -sSL https://dokploy.com/install.sh | sh
                  touch /var/lib/docker/.dokploy-installed
                  echo "Dokploy install complete."
                else
                  echo "Dokploy already installed — skipping installer, just starting daemon."
                fi
                wait $$DOCKERD_PID
    ${RUNNER_SERVICE}:
        image: docker:27-dind
        container_name: ${RUNNER_CONTAINER}
        hostname: ${RUNNER_SERVICE}
        restart: 'no'
        privileged: true
        stop_grace_period: 30s
        environment:
            - DOCKER_TLS_CERTDIR=
        ports:
            # Loopback-only, ephemeral host port: only act (on the host) uses it.
            - '127.0.0.1::${RUNNER_DOCKERD_PORT}'
        volumes:
            - runner-data:/var/lib/docker
        healthcheck:
            test: ['CMD-SHELL', 'docker info >/dev/null 2>&1 || exit 1']
            interval: 2s
            timeout: 5s
            retries: 60
            start_period: 5s
volumes:
    dokploy-data:
    dokploy-etc:
    runner-data:
`;

const REGISTRY_COMPOSE_YAML = `services:
  registry:
    image: registry:3
    container_name: registry
    restart: unless-stopped
    environment:
      - REGISTRY_STORAGE_DELETE_ENABLED=true
      - "REGISTRY_HTTP_HEADERS_Access-Control-Allow-Origin=[\\"*\\"]"
      - "REGISTRY_HTTP_HEADERS_Access-Control-Allow-Methods=[HEAD,GET,OPTIONS,DELETE]"
      - "REGISTRY_HTTP_HEADERS_Access-Control-Allow-Credentials=[true]"
      - "REGISTRY_HTTP_HEADERS_Access-Control-Allow-Headers=[Authorization,Accept,Cache-Control]"
      - "REGISTRY_HTTP_HEADERS_Access-Control-Expose-Headers=[Docker-Content-Digest]"
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry
  registry-ui:
    image: joxit/docker-registry-ui:latest
    container_name: registry-ui
    restart: unless-stopped
    depends_on:
      - registry
    environment:
      - REGISTRY_TITLE=Local Registry
      - NGINX_PROXY_PASS_URL=http://registry:5000
      - SINGLE_REGISTRY=true
      - DELETE_IMAGES=true
    ports:
      - "5001:80"
volumes:
  registry-data:
`;

// Runs inside the Dokploy container against the inner Docker daemon. Removes
// everything Dokploy deployed (keeping Dokploy's own services: dokploy,
// dokploy-postgres, dokploy-redis, dokploy-traefik), then wipes Dokploy's DB
// and files.
const DOKPLOY_RESET = `
set -e
ids=$(docker ps -aq --filter label=com.docker.compose.project)
[ -z "$ids" ] || docker rm -f $ids
svcs=$(docker service ls --format '{{.Name}}' | grep -v -E '^dokploy(-postgres|-redis|-traefik)?$' || true)
[ -z "$svcs" ] || docker service rm $svcs
nets=$(docker network ls -q --filter label=com.docker.compose.project)
[ -z "$nets" ] || docker network rm $nets
vols=$(docker volume ls -q --filter label=com.docker.compose.project)
[ -z "$vols" ] || docker volume rm $vols
pg=$(docker ps -qf name=dokploy-postgres.1)
[ -n "$pg" ] || { echo 'dokploy-postgres is not running' >&2; exit 1; }
docker exec "$pg" psql -q -U dokploy -d dokploy -c 'SET client_min_messages TO warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'
rm -rf /etc/dokploy/compose/* /etc/dokploy/applications/* /etc/dokploy/logs/* /etc/dokploy/schedules/*
docker service update --detach --force dokploy
`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** `docker compose` for the sandbox project; env fills the compose file's variables. */
const compose = (env, ...args) =>
    $({
        stdio: 'inherit',
        env: { ...process.env, ...env },
    })`docker compose -f ${COMPOSE_FILE} -p ${SANDBOX_PROJECT} ${args}`;

/** Runs fn and prints how long it took. */
async function timed(label, fn) {
    const t0 = Date.now();
    try {
        return await fn();
    } finally {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        echo(chalk.gray(`  ⏱ ${label}: ${secs}s`));
    }
}

async function waitFor(label, check, { timeoutMs, intervalMs = 1000 }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            if (await check()) return;
        } catch {}
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

/** Reads the CI keypair, or null if it hasn't been generated yet. */
async function readSshKey() {
    const pub = `${CI_SSH_KEY_FILE}.pub`;
    if (!fs.existsSync(CI_SSH_KEY_FILE) || !fs.existsSync(pub)) {
        return null;
    }
    return {
        privateKey: await fs.readFile(CI_SSH_KEY_FILE, 'utf8'),
        publicKey: (await fs.readFile(pub, 'utf8')).trim(),
    };
}

/** For run-act: the key must already exist and match the container. */
export async function loadSshKey() {
    const key = await readSshKey();
    if (!key)
        throw new Error(
            `No sandbox SSH key at ${CI_SSH_KEY_FILE}.\nRecreate the sandbox: \`pnpm sandbox stop\` then \`pnpm sandbox start\`.`,
        );
    return key;
}

async function containerRunning(name) {
    const res = await $`docker inspect -f ${'{{.State.Running}}'} ${name}`
        .nothrow()
        .quiet();
    return res.exitCode === 0 && res.stdout.trim() === 'true';
}

export async function assertSandboxRunning() {
    const instances = [
        { name: DOKPLOY_CONTAINER, label: 'Dokploy server instance' },
        { name: RUNNER_CONTAINER, label: 'GitHub runner instance' },
    ];
    for (const { name, label } of instances) {
        if (!(await containerRunning(name)))
            throw new Error(
                `${label} ("${name}") is not running.\nStart the sandbox with \`pnpm sandbox start\`.`,
            );
    }
}

/** Host port `container` publishes `containerPort` on, or `fallback`. */
async function detectHostPort(container, containerPort, fallback) {
    const res = await $`docker port ${container} ${containerPort}/tcp`
        .nothrow()
        .quiet();
    const first = res.stdout.trim().split('\n')[0] ?? '';
    const port = Number(first.split(':').pop());
    return Number.isInteger(port) && port > 0 ? port : fallback;
}

/** Where Dokploy is published on the host. */
export const detectDokployUrl = async () =>
    `http://localhost:${await detectHostPort(DOKPLOY_CONTAINER, DEFAULT_DOKPLOY_PORT, DEFAULT_DOKPLOY_PORT)}`;

/** DOCKER_HOST act must use so every job lands in the runner instance's daemon. */
export async function runnerDockerHost() {
    const port = await detectHostPort(RUNNER_CONTAINER, RUNNER_DOCKERD_PORT, 0);
    if (!port)
        throw new Error(
            'Could not find the runner Docker port.\nRecreate it: `pnpm sandbox stop --rm` then `pnpm sandbox start`.',
        );
    return `tcp://127.0.0.1:${port}`;
}

export async function resetRunner() {
    await $`docker exec ${RUNNER_CONTAINER} sh -c ${`
docker buildx rm --force shipkit-builder >/dev/null 2>&1 || true
docker ps -aq | xargs -r docker rm -f
docker image prune -f >/dev/null
docker images --format '{{.Repository}}:{{.Tag}}' \\
  | grep -v -E '^(catthehacker/|moby/buildkit:)' \\
  | xargs -r docker rmi -f || true
docker volume prune -af >/dev/null
docker builder prune -af >/dev/null || true
`}`;
}

async function writeComposeFile() {
    await fs.ensureDir(COMPOSE_DIR);
    await fs.writeFile(COMPOSE_FILE, COMPOSE_YAML);
    await fs.writeFile(DOCKERFILE, DOCKERFILE_CONTENT);
}

async function waitForDokploy(url, timeoutMs = 20 * 60 * 1000) {
    const title = 'Waiting for Dokploy to be ready...';
    if (process.env.CI) echo(chalk.blue(title));
    await spinner(chalk.blue(title), () =>
        waitFor(
            'Dokploy',
            async () =>
                (await fetch(url, { signal: AbortSignal.timeout(3000) }))
                    .status < 500,
            { timeoutMs, intervalMs: 2000 },
        ),
    );
    echo(chalk.green(`✓ Dokploy is ready at ${url}`));
}

// ---------------------------------------------------------------------------
// Dokploy bootstrap
// ---------------------------------------------------------------------------

/** Cached admin API key; creates the admin account + key on first use. */
export async function getOrCreateApiKey(url) {
    // The dp client reads its config from process.env on first use; feed it the
    // sandbox URL here since this is the only place that knows it.
    process.env.DOKPLOY_URL = url;
    if (fs.existsSync(DOKPLOY_APIKEY_FILE)) {
        try {
            const cached = JSON.parse(
                await fs.readFile(DOKPLOY_APIKEY_FILE, 'utf8'),
            );
            if (cached.apiKey && cached.userId) {
                process.env.DOKPLOY_API_KEY = cached.apiKey;
                // Validate before trusting: cheap authenticated call; throws on a stale key.
                await dp.project.All();
                return cached;
            }
        } catch {}
    }
    echo(chalk.blue('Creating Dokploy admin account and API key...'));
    const post = (route, body) =>
        fetch(`${url}/api/auth/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: url },
            body: JSON.stringify(body),
        });
    const credentials = {
        email: DOKPLOY_ADMIN_EMAIL,
        password: DOKPLOY_ADMIN_PASSWORD,
    };
    await post('sign-up/email', { ...credentials, name: 'Admin' }); // fails once admin exists; that's OK
    const signinRes = await post('sign-in/email', credentials);
    if (!signinRes.ok)
        throw new Error(
            `Dokploy admin sign-in failed (HTTP ${signinRes.status})\nReset it: \`pnpm sandbox stop\`, then \`pnpm sandbox start --clean\`.`,
        );
    // getSetCookie() returns all Set-Cookie headers as an array; keep only name=value.
    const cookie = signinRes.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    const data = await fetch(`${url}/api/auth/get-session`, {
        headers: { Cookie: cookie, Origin: url },
    }).then((r) => r.json());
    if (!data?.user || !data?.session)
        throw new Error('Could not read the Dokploy admin session.');
    // Bootstrap: no API key yet, authenticate with session cookie.
    process.env.DOKPLOY_COOKIE = cookie;
    const keyData = await dp.user.CreateApiKey({
        body: {
            name: 'sandbox-bootstrap',
            rateLimitEnabled: false,
            metadata: { organizationId: data.session.activeOrganizationId },
        },
    });
    const created = { apiKey: keyData.key, userId: data.user.id };
    // Switch to API key auth for all subsequent dp.* calls.
    process.env.DOKPLOY_API_KEY = created.apiKey;
    delete process.env.DOKPLOY_COOKIE;
    await fs.writeFile(DOKPLOY_APIKEY_FILE, JSON.stringify(created, null, 2), {
        mode: 0o600,
    });
    echo(chalk.green('✓ Dokploy API key created and cached'));
    return created;
}

// ---------------------------------------------------------------------------
// public commands
// ---------------------------------------------------------------------------
export async function startSandbox({ port, registryUiPort, clean }) {
    if (
        (await containerRunning(DOKPLOY_CONTAINER)) ||
        (await containerRunning(RUNNER_CONTAINER))
    )
        throw new Error(
            'Sandbox is already running.\nUse `pnpm sandbox stop` to stop it first.',
        );
    const dokployUrl = `http://localhost:${port}`;
    // True if the Dokploy data volume exists (i.e. Dokploy was installed before).
    const hadData =
        (
            await $`docker volume inspect ${DOKPLOY_DATA_VOLUME}`
                .nothrow()
                .quiet()
        ).exitCode === 0;
    if (!hadData) await fs.remove(DOKPLOY_APIKEY_FILE).catch(() => {});
    if (clean && !hadData)
        echo(chalk.gray('· No existing Dokploy data — nothing to clean'));

    // Per-machine CI keypair, generated on the first `start`. The public half
    // goes into the container (CI_SSH_PUBKEY); `run-act` injects the private
    // half into act. Nothing key-related is committed or kept in `.secrets`.
    let sshKey = await readSshKey();
    if (!sshKey) {
        echo(chalk.blue('Generating CI SSH keypair for sandbox...'));
        await fs.ensureDir(path.dirname(CI_SSH_KEY_FILE));
        await fs.remove(CI_SSH_KEY_FILE).catch(() => {});
        await fs.remove(`${CI_SSH_KEY_FILE}.pub`).catch(() => {});
        await $`ssh-keygen -q -t ed25519 -N ${''} -C sandbox-ci -f ${CI_SSH_KEY_FILE}`;
        sshKey = await readSshKey();
    }

    if (process.platform === 'linux') {
        const modulesConf = '/etc/modules-load.d/ipvs.conf';
        echo(chalk.blue('Checking ip_vs kernel modules...'));
        const loaded = new Set(
            (await $`lsmod`.quiet()).stdout
                .split('\n')
                .map((l) => l.split(/\s+/)[0]),
        );
        const missing = ['ip_vs', 'ip_vs_rr'].filter((m) => !loaded.has(m));
        if (missing.length) {
            echo(chalk.yellow(`Loading ${missing.join(', ')} (sudo)...`));
            for (const m of missing) await $`sudo modprobe ${m}`;
            if (!fs.existsSync(modulesConf)) {
                echo(chalk.yellow(`Persisting modules to ${modulesConf}...`));
                await $`printf 'ip_vs\\nip_vs_rr\\n' | sudo tee ${modulesConf} > /dev/null`;
            }
        }
        echo(chalk.green('✓ ip_vs modules ready'));
    }

    await writeComposeFile();
    echo(
        chalk.blue(
            `Starting sandbox environment (Dokploy server :${port}, registry UI :${registryUiPort})...`,
        ),
    );
    try {
        await timed('compose up', () =>
            compose(
                {
                    DOKPLOY_PORT: String(port),
                    REGISTRY_UI_PORT: String(registryUiPort),
                    CI_SSH_PUBKEY: sshKey.publicKey,
                },
                'up',
                '-d',
                '--build',
            ),
        );
        await timed('runner ready', () =>
            waitFor(
                'the runner instance daemon',
                async () => {
                    await $`docker exec ${RUNNER_CONTAINER} docker info`.quiet();
                    return true;
                },
                { timeoutMs: 60_000 },
            ),
        );
        await timed('pull job image', async () => {
            const pull = await $({
                stdio: 'inherit',
                nothrow: true,
            })`docker exec ${RUNNER_CONTAINER} docker pull ${JOB_IMAGE}`;
            if (pull.exitCode !== 0)
                echo(
                    chalk.yellow(
                        'Could not pre-pull the job image; act will pull it later.',
                    ),
                );
        });
        await timed('dokploy ready', () => waitForDokploy(dokployUrl));
        if (clean && hadData) {
            // Wipes Dokploy's DB + files but keeps the inner Docker layer, so
            // there is no reinstall. Requires Dokploy to have run its
            // migrations at least once.
            await timed('reset dokploy state', async () => {
                echo(
                    chalk.yellow(
                        'Cleaning Dokploy instance state (DB + filesystem, keeping Docker layer)...',
                    ),
                );
                await $`docker exec ${DOKPLOY_CONTAINER} sh -c ${DOKPLOY_RESET}`;
                await fs.remove(DOKPLOY_APIKEY_FILE).catch(() => {});
                echo(
                    chalk.green(
                        '✓ Dokploy state wiped — waiting for fresh startup...',
                    ),
                );
            });
            await timed('dokploy ready (after reset)', () =>
                waitForDokploy(dokployUrl),
            );
        }
        await timed('setup dokploy', async () => {
            echo(chalk.blue('Setting up Dokploy instance...'));
            const { userId } = await getOrCreateApiKey(dokployUrl);

            // Registry project + compose service
            let project = (await dp.project.All()).find(
                (p) => p.name === 'registry',
            );
            if (!project) {
                echo(chalk.blue('Creating registry project...'));
                await dp.project.Create({
                    body: { name: 'registry', description: 'Local registry' },
                });
                project = (await dp.project.All()).find(
                    (p) => p.name === 'registry',
                );
            }
            const environment = project.environments?.find(
                (e) => e.name === 'production',
            );
            if (!environment?.compose?.some((c) => c.name === 'registry')) {
                echo(chalk.blue('Creating registry compose service...'));
                const registryCompose = await dp.compose.Create({
                    body: {
                        name: 'registry',
                        environmentId: environment?.environmentId,
                        composeType: 'docker-compose',
                        sourceType: 'raw',
                        composeFile: REGISTRY_COMPOSE_YAML,
                    },
                });
                await dp.compose.Deploy({
                    body: { composeId: registryCompose.composeId },
                });
                echo(chalk.green('✓ Registry compose deployed'));
            } else {
                echo(chalk.gray('· Registry compose already exists'));
            }

            // Registry GC cron
            const schedules = await dp.schedule.List({
                query: { id: userId, scheduleType: 'dokploy-server' },
            });
            if (!schedules.some((s) => s.name === 'Registry GC')) {
                echo(chalk.blue('Creating registry GC cron schedule...'));
                await dp.schedule.Create({
                    body: {
                        name: 'Registry GC',
                        scheduleType: 'dokploy-server',
                        cronExpression: '0 3 * * *',
                        command:
                            'docker exec registry registry garbage-collect /etc/distribution/config.yml --delete-untagged',
                        enabled: true,
                    },
                });
                echo(chalk.green('✓ Registry GC cron created (0 3 * * *)'));
            } else {
                echo(chalk.gray('· Registry GC cron already exists'));
            }

            echo(chalk.green('✓ Dokploy instance fully ready'));
            echo(
                chalk.green(
                    `  Registry UI → http://localhost:${registryUiPort}`,
                ),
            );
            echo(chalk.green(`  Dokploy     → ${dokployUrl}`));
            echo(chalk.cyan(`  Admin email → ${DOKPLOY_ADMIN_EMAIL}`));
            echo(chalk.cyan(`  Admin pass  → ${DOKPLOY_ADMIN_PASSWORD}`));
        });
    } catch (err) {
        throw new Error(
            `${err?.message ?? String(err)}\nInstances left running. Inspect with \`docker logs ${DOKPLOY_CONTAINER}\` or \`docker logs ${RUNNER_CONTAINER}\`, or run \`pnpm sandbox stop\` to clean up.`,
        );
    }
    echo(
        chalk.cyan(
            '\nSandbox is running (Dokploy server + GitHub runner).\nRun a workflow: `pnpm sandbox run-act`.\nStop: `pnpm sandbox stop` (keeps containers) or `pnpm sandbox stop --rm` (removes containers).',
        ),
    );
}

export async function stopSandbox({ rm }) {
    await writeComposeFile();
    if (rm) {
        echo(chalk.blue('Removing sandbox (containers + network)...'));
        await compose({}, 'down');
        echo(chalk.green('✓ Sandbox stopped and removed (volumes kept)'));
    } else {
        echo(chalk.blue('Stopping sandbox (keeping containers)...'));
        await compose({}, 'stop');
        echo(
            chalk.green(
                '✓ Sandbox stopped (containers, network and volumes kept)',
            ),
        );
    }
}
