import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { cancel, isCancel, select } from '@clack/prompts';
import { $, chalk, echo, fs, which } from 'zx';

import {
    assertSandboxRunning,
    detectDokployUrl,
    DOKPLOY_HOST,
    getOrCreateApiKey,
    loadSshKey,
    RUNNER_CACHE_VOLUME,
    RUNNER_IMAGE,
    SANDBOX_NETWORK,
} from './sandbox.js';

const WORKFLOWS_DIR = '.github/workflows';
// Where the runner keeps actions/cache artifacts (backed by RUNNER_CACHE_VOLUME).
const CACHE_DIR = '/act-cache';

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
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`--${flag} "${raw}": expected KEY=VALUE`);
    }
    if (eq !== -1) return [key, raw.slice(eq + 1)];
    if (!(key in process.env)) {
        throw new Error(`--${flag} ${key}: not set in your environment`);
    }
    return [key, process.env[key]];
}

async function readEnvFile(file, { required = false } = {}) {
    if (!fs.existsSync(file)) {
        if (required) throw new Error(`File not found: ${file}`);
        return {};
    }
    echo(chalk.gray(`  · loaded ${file}`));
    return parseEnv(await fs.readFile(file, 'utf8'));
}

/** `--*-from` files (must exist; relative to cwd), then inline `KEY=VALUE`s on top. */
async function loadLayer(flag, files, inline) {
    const layer = {};
    for (const file of files) {
        Object.assign(
            layer,
            await readEnvFile(path.resolve(file), { required: true }),
        );
    }
    for (const raw of inline) {
        const [key, value] = parseAssignment(flag, raw);
        layer[key] = value;
    }
    return layer;
}

/**
 * @param {string} [requestedName]  workflow file name without extension
 * @param {{
 *   ref?: string,                  // pretend to run on this branch (e.g. 'staging')
 *   event?: string,                // GitHub event to trigger
 *   disableActionsCache?: boolean, // don't start the cache server
 *   envFiles?: string[],           // --env-from (repeatable)
 *   secretsFiles?: string[],       // --secrets-from (repeatable)
 *   appsEnv?: boolean,             // merge every apps/<dir>/.env into secrets
 *   env?: string[],                // --env KEY=VALUE, or bare KEY (repeatable)
 *   secrets?: string[],            // --secret KEY=VALUE, or bare KEY (repeatable)
 * }} [opts]
 */
export async function runAct(
    requestedName,
    {
        ref,
        event = 'workflow_dispatch',
        disableActionsCache,
        envFiles = [],
        secretsFiles = [],
        appsEnv,
        env: inlineEnv = [],
        secrets: inlineSecrets = [],
    } = {},
) {
    const root = (
        await $`git rev-parse --show-toplevel`.nothrow().quiet()
    ).stdout.trim();
    if (!root) throw new Error('Not inside a git repository.');
    for (const cmd of ['tar', 'docker']) {
        if (!(await which(cmd, { nothrow: true })))
            throw new Error(`\`${cmd}\` is not installed or not in PATH.`);
    }
    await assertSandboxRunning();

    // --- resolve workflow ---------------------------------------------------
    const workflowsDir = path.join(root, WORKFLOWS_DIR);
    const files = fs.existsSync(workflowsDir)
        ? fs
              .readdirSync(workflowsDir)
              .filter((f) => /\.ya?ml$/.test(f))
              .sort()
        : [];
    if (!files.length)
        throw new Error(`No workflows found in ${WORKFLOWS_DIR}/`);
    const names = files.map((f) => f.replace(/\.ya?ml$/, ''));

    let name = requestedName;
    if (!name && names.length === 1) name = names[0];
    if (!name) {
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
    const workflowFile = files[names.indexOf(name)];
    if (!workflowFile)
        throw new Error(
            `No workflow "${name}" in ${WORKFLOWS_DIR}/\nAvailable: ${names.join(', ')}`,
        );

    // --- env + secrets ------------------------------------------------------
    // Read from the real root: `.env` and `.secrets` are gitignored, so they
    // are not in the workspace snapshot.
    echo(chalk.blue('Loading env and secrets...'));
    const env = {
        ...(await readEnvFile(path.join(root, '.env'))),
        ...(await loadLayer('env', envFiles, inlineEnv)),
    };
    const userSecrets = await readEnvFile(path.join(root, '.secrets'));
    const appsDir = path.join(root, 'apps');
    if (appsEnv && fs.existsSync(appsDir)) {
        // Latest dir (by name) wins on collisions.
        for (const app of fs.readdirSync(appsDir).sort()) {
            Object.assign(
                userSecrets,
                await readEnvFile(path.join(appsDir, app, '.env')),
            );
        }
    }
    Object.assign(
        userSecrets,
        await loadLayer('secret', secretsFiles, inlineSecrets),
    );
    if (!Object.keys(userSecrets).length) {
        echo(
            chalk.yellow(
                'No app secrets found (no .secrets at the repo root; use --secrets-from or --secret).',
            ),
        );
    }

    // The only values injected: how to reach the sandbox over SSH (by name,
    // port 22, like a remote server), the SSH key and the API key.
    const { apiKey } = await getOrCreateApiKey(await detectDokployUrl());
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

    // --- workspace bundle ---------------------------------------------------
    // One tar: the working tree as git sees it (tracked + untracked-not-ignored,
    // minus files deleted on disk) plus .git, with .secrets/.env appended.
    // The stage dir holds secrets, so it is removed on every exit path
    // (normal, process.exit, Ctrl-C).
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'act-stage-'));
    process.once('exit', () => fs.removeSync(stageDir));
    process.once('SIGINT', () => process.exit(130));

    await fs.writeFile(
        path.join(stageDir, '.secrets'),
        formatEnv({ ...userSecrets, ...injected }),
        { mode: 0o600 },
    );
    await fs.writeFile(path.join(stageDir, '.env'), formatEnv(env));

    const listed = (
        await $`git -C ${root} ls-files -z --cached --others --exclude-standard`.quiet()
    ).stdout.split('\0');
    // --cached also lists files deleted on disk; lstat drops those (and, unlike
    // existsSync, keeps dangling symlinks). The Set dedupes merge-conflict entries.
    const snapshot = [...new Set(listed)].filter(
        (f) => f && fs.lstatSync(path.join(root, f), { throwIfNoEntry: false }),
    );
    const bundle = path.join(stageDir, 'bundle.tar');
    await $({
        input: [...snapshot, '.git'].join('\0') + '\0',
    })`tar -C ${root} -cf ${bundle} --null -T -`;
    await $`tar -C ${stageDir} -rf ${bundle} .secrets .env`;

    // --- run ----------------------------------------------------------------
    // Static script: the bundle arrives on stdin, $REF via -e, act's args as "$@".
    // cwd is /workspace (docker run -w creates it).
    const script = `
set -e
tar -xf - --no-same-owner
[ -z "$REF" ] || git checkout --quiet -B "$REF"
dockerd --storage-driver=fuse-overlayfs >/var/log/dockerd.log 2>&1 &
timeout 60 sh -c 'until docker info >/dev/null 2>&1; do sleep 1; done' \\
  || { echo "dockerd failed to start:" >&2; cat /var/log/dockerd.log >&2; exit 1; }
exec act "$@"
`;
    const actArgs = [
        event,
        '-W',
        `${WORKFLOWS_DIR}/${workflowFile}`,
        '--secret-file',
        '.secrets',
        '--env-file',
        '.env',
        // Run steps directly on the runner's own filesystem (no job container)
        // so the workspace and $HOME share a root fs and pnpm hardlinks work.
        '-P',
        'ubuntu-latest=-self-hosted',
        // Cache server on a random free port; act injects ACTIONS_CACHE_URL.
        ...(disableActionsCache
            ? []
            : [
                  '--cache-server-addr',
                  '127.0.0.1',
                  '--cache-server-port',
                  '0',
                  '--cache-server-path',
                  CACHE_DIR,
              ]),
    ];

    echo(chalk.blue(`Running ${name} (${event}) in ephemeral runner`));
    const result = await $({
        input: fs.createReadStream(bundle),
        stdio: ['pipe', 'inherit', 'inherit'],
        nothrow: true,
    })`docker run --rm -i --init --privileged \
        --network ${SANDBOX_NETWORK} \
        -w /workspace \
        -v ${RUNNER_CACHE_VOLUME}:${CACHE_DIR} \
        -e REF=${ref ?? ''} \
        ${RUNNER_IMAGE} bash -c ${script} runner ${actArgs}`;

    if (result.exitCode !== 0)
        throw new Error(
            `${name} failed (act exited with code ${result.exitCode})`,
        );
    echo(chalk.green(`✓ ${name} finished`));
}
