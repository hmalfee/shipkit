#!/usr/bin/env node
import { client } from '@dokploy/sdk';
import { chalk, echo, minimist } from 'zx';

import { deploy } from './deploy.js';
import { ensureApps } from './ensure-apps.js';
import { ensureDb } from './ensure-db.js';
import { ensureProject } from './ensure-project.js';

const { DOKPLOY_URL, DOKPLOY_API_KEY } = process.env;

if (!DOKPLOY_URL || !DOKPLOY_API_KEY) {
    echo(
        chalk.red(
            'Missing required Dokploy env vars (DOKPLOY_URL, DOKPLOY_API_KEY)',
        ),
    );
    process.exit(1);
}

// Every flag is parsed as an explicit string/boolean so an ID-like value
// (e.g. a purely numeric project name) is never silently coerced to a
// Number by minimist's default parsing — same behavior as the old manual loop.
const argv = minimist(process.argv.slice(2), {
    string: [
        'name',
        'project',
        'names',
        'baseDomain',
        'appId',
        'image',
        'envFile',
    ],
    boolean: ['postgres', 'redis', 'mongodb'],
    alias: {
        baseDomain: 'base-domain',
        appId: 'app-id',
        envFile: 'env-file',
    },
});

const USAGE = {
    'ensure-project': 'dokploy ensure-project --name <name>',
    'ensure-db':
        'dokploy ensure-db --project <id> [--postgres] [--redis] [--mongodb]',
    'ensure-apps':
        'dokploy ensure-apps --project <id> --names <app1,app2,...> [--base-domain <domain>]',
    deploy: 'dokploy deploy --project <id> --app-id <id> --image <full-image-ref> --env-file <path>',
};

function usageExit(message) {
    echo(chalk.red(`Usage: ${message}`));
    process.exit(1);
}

const command = argv._[0];
if (!USAGE[command]) {
    usageExit(`dokploy <${Object.keys(USAGE).join('|')}>`);
}

client.setConfig({
    baseUrl: `${DOKPLOY_URL}/api`,
    headers: { 'x-api-key': DOKPLOY_API_KEY },
});

async function run() {
    switch (command) {
        case 'ensure-project': {
            if (!argv.name) usageExit(USAGE[command]);
            await ensureProject({ name: argv.name });
            break;
        }
        case 'ensure-db': {
            const dbs = {
                postgres: argv.postgres,
                redis: argv.redis,
                mongodb: argv.mongodb,
            };
            if (!argv.project || !Object.values(dbs).some(Boolean)) {
                usageExit(USAGE[command]);
            }
            await ensureDb({ projectId: argv.project, dbs });
            break;
        }
        case 'ensure-apps': {
            if (!argv.project || !argv.names) usageExit(USAGE[command]);
            const apps = argv.names
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean);
            await ensureApps({
                projectId: argv.project,
                apps,
                baseDomain: argv.baseDomain,
            });
            break;
        }
        case 'deploy': {
            if (!argv.project || !argv.appId || !argv.image || !argv.envFile) {
                usageExit(USAGE[command]);
            }
            await deploy({
                projectId: argv.project,
                appId: argv.appId,
                image: argv.image,
                envFile: argv.envFile,
            });
            break;
        }
    }
}

run().catch((err) => {
    echo(chalk.red(err.stack || err));
    process.exit(1);
});
