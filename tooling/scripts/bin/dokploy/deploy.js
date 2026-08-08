import {
    applicationDeploy,
    applicationOne,
    applicationSaveDockerProvider,
    applicationSaveEnvironment,
    environmentOne,
    environmentUpdate,
} from '@dokploy/sdk';
import { chalk, echo, fs } from 'zx';

import { parseEnv, stringifyEnv, unwrap } from './utils.js';

export async function deploy({ appId, image, envFile }) {
    // 1. Resolve app's environment directly from the app record
    echo('Fetching app...');
    const app = unwrap(
        await applicationOne({ query: { applicationId: appId } }),
        'Failed to fetch app',
    );
    const envId = app.environmentId;
    if (!envId) {
        echo(chalk.red(`App ${appId} has no environmentId`));
        process.exit(1);
    }

    // 2. Read explicit env file
    if (!fs.existsSync(envFile)) {
        echo(chalk.red(`Env file not found: ${envFile}`));
        process.exit(1);
    }
    echo(`Merging environment from ${envFile}`);
    const fileContents = fs.readFileSync(envFile, 'utf-8');
    const buildEnv = parseEnv(fileContents);

    // 3. Merge into the environment-level vars (not project-level), so
    //    staging and production never collide.
    const environment = unwrap(
        await environmentOne({ query: { environmentId: envId } }),
        'Failed to fetch environment',
    );
    const envObj = { ...parseEnv(environment.env ?? ''), ...buildEnv };

    echo(`Pushing consolidated variables to environment ${envId}...`);
    unwrap(
        await environmentUpdate({
            body: { environmentId: envId, env: stringifyEnv(envObj) },
        }),
        'Failed to update environment env',
    );

    // 4. Map env vars into the app (referencing environment level)
    const appEnvString = Object.keys(envObj)
        .map((k) => k + '=${{environment.' + k + '}}\n')
        .join('');

    echo(`Sending all vars to app (${appId})...`);
    await applicationSaveEnvironment({
        body: {
            applicationId: appId,
            env: appEnvString,
            buildArgs: null,
            buildSecrets: null,
            createEnvFile: false,
        },
    });

    // 5. Deploy app
    echo(`Deploying ${image} (applicationId: ${appId})`);

    unwrap(
        await applicationSaveDockerProvider({
            body: {
                applicationId: appId,
                dockerImage: image,
                username: '',
                password: '',
                registryUrl: '',
            },
        }),
        `Failed to save Docker provider for ${appId}`,
    );
    const deployRes = unwrap(
        await applicationDeploy({ body: { applicationId: appId } }),
        `Failed to deploy ${appId}`,
    );
    echo(`deploy response: ${JSON.stringify(deployRes)}`);
}
