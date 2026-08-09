#!/usr/bin/env node
import { client } from '@dokploy/sdk';
import { chalk, echo, fs, minimist } from 'zx';

import { deploy } from './deploy.js';
import { ensureApps } from './ensure-apps.js';
import { ensureDb } from './ensure-db.js';
import { ensureProject } from './ensure-project.js';
import { stopProject } from './stop-project.js';

const { DOKPLOY_URL, DOKPLOY_API_KEY } = process.env;

if (!DOKPLOY_URL || !DOKPLOY_API_KEY) {
    echo(
        chalk.red(
            'Missing required Dokploy env vars (DOKPLOY_URL, DOKPLOY_API_KEY)',
        ),
    );
    process.exit(1);
}

const argv = minimist(process.argv.slice(2), {
    string: [
        'project',
        'projectDir',
        'appsDir',
        'baseDomain',
        'appId',
        'image',
        'envFile',
    ],
    boolean: ['postgres', 'redis', 'mongodb', 'staging'],
    alias: {
        baseDomain: 'base-domain',
        appId: 'app-id',
        envFile: 'env-file',
        appsDir: 'apps-dir',
        projectDir: 'project-dir',
    },
});

const staging = argv.staging || process.env.GITHUB_REF_NAME === 'staging';

const USAGE = {
    'ensure-project':
        'dokploy ensure-project [--project-dir <path>] [--staging]',
    'ensure-db':
        'dokploy ensure-db --project <id> [--postgres] [--redis] [--mongodb] [--staging]',
    'ensure-apps':
        'dokploy ensure-apps --project <id> [--apps-dir <path>] [--base-domain <domain>] [--staging]',
    deploy: 'dokploy deploy --app-id <id> --image <full-image-ref> --env-file <path>',
    'stop-project': 'dokploy stop-project --project <id> [--staging]',
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
            await ensureProject({ projectDir: argv.projectDir, staging });
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
            await ensureDb({
                projectId: argv.project,
                dbs,
                staging,
            });
            break;
        }
        case 'ensure-apps': {
            if (!argv.project) usageExit(USAGE[command]);
            await ensureApps({
                projectId: argv.project,
                appsDir: argv.appsDir,
                baseDomain: argv.baseDomain,
                staging,
            });
            break;
        }
        case 'deploy': {
            if (!argv.appId || !argv.image || !argv.envFile) {
                usageExit(USAGE[command]);
            }
            await deploy({
                appId: argv.appId,
                image: argv.image,
                envFile: argv.envFile,
                staging,
            });
            break;
        }
        case 'stop-project': {
            if (!argv.project) usageExit(USAGE[command]);
            await stopProject({
                projectId: argv.project,
                staging,
            });
            break;
        }
    }
}

run().catch((err) => {
    echo(chalk.red(err.stack || err));
    process.exit(1);
});
