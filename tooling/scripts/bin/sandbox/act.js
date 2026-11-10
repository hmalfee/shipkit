import path from 'node:path';
import { parseEnv } from 'node:util';

import { cancel, isCancel, select } from '@clack/prompts';
import { $, chalk, echo, fs } from 'zx';

import {
    assertSandboxRunning,
    detectDokployUrl,
    DOKPLOY_HOST,
    getOrCreateApiKey,
    JOB_IMAGE,
    loadSshKey,
    resetRunner,
    RUNNER_CONTAINER,
} from './sandbox.js';

const WORKFLOWS_DIR = '.github/workflows';
// Default to workflow_dispatch when no event is explicitly provided.
const DEFAULT_EVENT = 'workflow_dispatch';
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Persistent cache volume mount path inside the runner container.
const ACT_CACHE_PATH = '/root/.cache/act-cache';
const ACT_BASE_ARGS = [
    // Job shares the runner's network namespace, like a process on a VM: the
    // ssh -L tunnels, dockerd and buildkit all see the same 127.0.0.1.
    '--network=host',
    // Mount the *runner's* docker.sock (a path inside the runner container)
    // into the job. act talks to the runner's daemon through DOCKER_HOST.
    '--container-daemon-socket=unix:///var/run/docker.sock',
    '-P',
    `ubuntu-latest=${JOB_IMAGE}`,
];

// Cache server flags: bound to 127.0.0.1 inside the runner; reachable from
// job containers via --network=host. Port 0 = random free port; act injects
// ACTIONS_CACHE_URL automatically so actions/cache just works.
const ACT_CACHE_ARGS = [
    '--cache-server-addr',
    '127.0.0.1',
    '--cache-server-port',
    '0',
    '--cache-server-path',
    ACT_CACHE_PATH,
];

/**
 * Serialises env values for act's --env-file / --secret-file.
 * Single quotes are literal in act's dotenv parser (no $VAR expansion, no
 * ` #` comments). Multi-line values and values containing `'` fall back to
 * double-quoted JSON (raw PEM keys).
 */
function formatEnv(obj) {
    return (
        Object.entries(obj)
            .map(([k, v]) => {
                const value = String(v);
                return `${k}=${
                    value.includes('\n') || value.includes("'")
                        ? JSON.stringify(value)
                        : `'${value}'`
                }`;
            })
            .join('\n') + '\n'
    );
}

/** `KEY=VALUE`, or bare `KEY` (taken from this process's environment). */
function parseAssignment(flag, raw) {
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw : raw.slice(0, eq);
    if (!ENV_KEY.test(key)) {
        throw new Error(`--${flag} "${raw}": expected KEY=VALUE`);
    }
    if (eq !== -1) return [key, raw.slice(eq + 1)];
    if (!(key in process.env)) {
        throw new Error(`--${flag} ${key}: not set in your environment`);
    }
    return [key, process.env[key]];
}

async function readEnvFile(file, { required }) {
    if (!fs.existsSync(file)) {
        if (required) throw new Error(`File not found: ${file}`);
        return {};
    }
    echo(chalk.gray(`  · loaded ${file}`));
    return parseEnv(await fs.readFile(file, 'utf8'));
}

/**
 * Applies `files` (must exist, relative to `cwd`) then `inline` KEY=VALUE
 * assignments on top of `target`, in order.
 */
async function applyLayers(target, { cwd, flag, files, inline }) {
    for (const file of files) {
        Object.assign(
            target,
            await readEnvFile(path.resolve(cwd, file), { required: true }),
        );
    }
    for (const raw of inline) {
        const [key, value] = parseAssignment(flag, raw);
        target[key] = value;
    }
    return target;
}

/**
 * @param {string} [requestedName]  workflow file name without extension
 * @param {{
 *   ref?: string,             // --ref: pretend to run on this branch (e.g. 'staging')
 *   event?: string,           // --event: GitHub event to trigger (default: 'workflow_dispatch')
 *   useCache?: boolean,       // --use-cache: skip the cold-runner reset (faster, less faithful)
 *   disableActionsCache?: boolean, // --disable-actions-cache: don't start the cache server (actions/cache steps become no-ops)
 *   envFiles?: string[],      // --env-from (repeatable)
 *   secretsFiles?: string[],  // --secrets-from (repeatable)
 *   appsEnv?: boolean,        // --secrets-from-apps-env: merge every apps/<dir>/.env into secrets
 *   env?: string[],           // --env KEY=VALUE, or bare KEY (repeatable)
 *   secrets?: string[],       // --secret KEY=VALUE, or bare KEY (repeatable)
 * }} [opts]
 */
export async function runAct(requestedName, opts = {}) {
    const root = (
        await $`git rev-parse --show-toplevel`.nothrow().quiet()
    ).stdout.trim();
    if (!root) throw new Error('Not inside a git repository.');

    // Preflight: host commands required before any container work.
    for (const cmd of ['tar', 'docker']) {
        if ((await $`which ${cmd}`.nothrow().quiet()).exitCode !== 0)
            throw new Error(`\`${cmd}\` is not installed or not in PATH.`);
    }

    await assertSandboxRunning();

    // --- resolve workflow ---------------------------------------------------
    const workflowsDir = path.join(root, WORKFLOWS_DIR);
    const workflowFiles = fs.existsSync(workflowsDir)
        ? fs
              .readdirSync(workflowsDir)
              .filter((f) => /\.ya?ml$/.test(f))
              .sort()
        : [];
    if (!workflowFiles.length)
        throw new Error(`No workflows found in ${WORKFLOWS_DIR}/`);

    const workflowName = (file) => file.replace(/\.ya?ml$/, '');
    const names = workflowFiles.map(workflowName);
    let name = requestedName;
    if (!name) {
        if (names.length === 1) {
            name = names[0];
        } else {
            const selected = await select({
                message: 'Select a workflow',
                options: names.map((n) => ({ value: n, label: n })),
            });
            if (isCancel(selected)) {
                cancel('Operation cancelled.');
                process.exit(0);
            }
            name = selected;
        }
    }
    const workflowFile = workflowFiles.find((f) => workflowName(f) === name);
    if (!workflowFile)
        throw new Error(
            `No workflow "${name}" in ${WORKFLOWS_DIR}/\nAvailable: ${names.join(', ')}`,
        );

    const dokployUrl = await detectDokployUrl();
    const cwd = process.cwd();

    // --- env + secrets ------------------------------------------------------
    // Read from the real root: `.env` and `.secrets` are gitignored, so they
    // are not in the workspace snapshot.
    echo(chalk.blue('Loading env and secrets...'));
    const userEnv = await applyLayers(
        await readEnvFile(path.join(root, '.env'), { required: false }),
        {
            cwd,
            flag: 'env',
            files: opts.envFiles ?? [],
            inline: opts.env ?? [],
        },
    );

    const userSecrets = await readEnvFile(path.join(root, '.secrets'), {
        required: false,
    });
    if (opts.appsEnv) {
        // Every apps/<dir>/.env, sorted by dir name. Latest dir wins on collisions.
        const appsDir = path.join(root, 'apps');
        if (fs.existsSync(appsDir)) {
            for (const dir of fs.readdirSync(appsDir).sort()) {
                Object.assign(
                    userSecrets,
                    await readEnvFile(path.join(appsDir, dir, '.env'), {
                        required: false,
                    }),
                );
            }
        }
    }

    await applyLayers(userSecrets, {
        cwd,
        flag: 'secret',
        files: opts.secretsFiles ?? [],
        inline: opts.secrets ?? [],
    });

    if (!Object.keys(userSecrets).length) {
        echo(
            chalk.yellow(
                'No app secrets found (no .secrets at the repo root; use --secrets-from or --secret).',
            ),
        );
    }

    // The only values injected: how to reach the sandbox over SSH (by name,
    // port 22, like a remote server), the SSH key and the API key.
    const { apiKey } = await getOrCreateApiKey(dokployUrl);
    const { privateKey } = await loadSshKey();
    const injected = {
        SSH_HOST: DOKPLOY_HOST,
        SSH_KEY: Buffer.from(privateKey).toString('base64'),
        DOKPLOY_API_KEY: apiKey,
    };
    const ignored = Object.keys(injected).filter((key) => key in userSecrets);
    if (ignored.length) {
        echo(
            chalk.yellow(
                `Ignoring ${ignored.join(', ')} from your secrets (injected by run-act; safe to delete).`,
            ),
        );
    }

    const secrets = { ...userSecrets, ...injected };
    if (!opts.useCache) {
        echo(
            chalk.blue(
                'Resetting Runner instance to a cold state (--use-cache to skip)...',
            ),
        );
        await resetRunner();
    }

    // Workspace lives inside the runner container; no host tmpdir needed.
    const workdir = `/tmp/act-run-${Date.now()}`;
    try {
        const secretsFile = `${workdir}/.secrets`;
        const envFile = `${workdir}/.env`;

        // --- workspace snapshot ---------------------------------------------
        // The local equivalent of `actions/checkout`: a throwaway snapshot of
        // HEAD plus your uncommitted work (staged, unstaged, untracked-but-not-
        // ignored). Ignored files (node_modules, .env, .secrets) are left out,
        // like on a real runner. If `ref` is given, the branch is checked out
        // so act derives github.ref / github.ref_name from git.
        await $`docker exec ${RUNNER_CONTAINER} mkdir -p ${workdir}`;
        await $`git -C ${root} archive HEAD`.pipe(
            $`docker exec -i ${RUNNER_CONTAINER} tar -x -C ${workdir}`,
        );
        await $`tar -C ${root} -c .git`.pipe(
            $`docker exec -i ${RUNNER_CONTAINER} tar -x -C ${workdir}`,
        );
        // Keep github.repository correct (the archive's origin is a local path).
        const origin = await $`git -C ${root} remote get-url origin`
            .nothrow()
            .quiet();
        if (origin.exitCode === 0) {
            await $`docker exec ${RUNNER_CONTAINER} git -C ${workdir} remote set-url origin ${origin.stdout.trim()}`;
        }
        // Overlay uncommitted work. --no-renames lists both sides of a rename
        // so the old path is removed and the new one is copied.
        const list = async (cmd) =>
            (await cmd).stdout.split('\0').filter(Boolean);
        const changed = new Set([
            ...(await list(
                $`git -C ${root} diff --name-only --no-renames -z HEAD`.quiet(),
            )),
            ...(await list(
                $`git -C ${root} ls-files -z -o --exclude-standard`.quiet(),
            )),
        ]);
        for (const file of changed) {
            const src = path.join(root, file);
            if (fs.existsSync(src)) {
                // tar -x creates parent dirs automatically; same pattern as git archive streaming.
                await $`tar -C ${root} -c ${file}`.pipe(
                    $`docker exec -i ${RUNNER_CONTAINER} tar -x -C ${workdir}`,
                );
            } else {
                await $`docker exec ${RUNNER_CONTAINER} rm -f ${workdir}/${file}`;
            }
        }
        if (opts.ref)
            await $`docker exec ${RUNNER_CONTAINER} git -C ${workdir} checkout --quiet -B ${opts.ref}`;

        // Write secrets and env files inside the runner (never touch the host fs).
        await $({
            input: formatEnv(secrets),
        })`docker exec -i ${RUNNER_CONTAINER} sh -c ${'cat > ' + secretsFile + ' && chmod 600 ' + secretsFile}`;
        await $({
            input: formatEnv(userEnv),
        })`docker exec -i ${RUNNER_CONTAINER} sh -c ${'cat > ' + envFile}`;

        // --- run act --------------------------------------------------------
        const event = opts.event || DEFAULT_EVENT;
        const args = [
            event,
            '--directory',
            workdir,
            '-W',
            `.github/workflows/${workflowFile}`,
            '--secret-file',
            secretsFile,
            '--env-file',
            envFile,
            ...ACT_BASE_ARGS,
            ...(opts.disableActionsCache ? [] : ACT_CACHE_ARGS),
        ];
        echo(chalk.blue(`Running ${name} (${event}) with act`));
        const result = await $({
            stdio: 'inherit',
            nothrow: true,
        })`docker exec -i ${RUNNER_CONTAINER} act ${args}`;
        if (result.exitCode !== 0)
            throw new Error(
                `${name} failed (act exited with code ${result.exitCode})`,
            );
        echo(chalk.green(`✓ ${name} finished`));
    } finally {
        await $`docker exec ${RUNNER_CONTAINER} rm -rf ${workdir}`.catch(
            () => {},
        );
    }
}
