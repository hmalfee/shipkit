import { chalk, echo, fs } from 'zx';

import { dp } from './dp.js';
import { parseEnv, stringifyEnv } from './utils.js';

export async function deploy({ appId, image, envFile }) {
    // 1. Resolve app's environment directly from the app record
    echo('Fetching app...');
    const app = await dp.applicationOne({ query: { applicationId: appId } });
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
    const environment = await dp.environmentOne({
        query: { environmentId: envId },
    });
    const envObj = { ...parseEnv(environment.env ?? ''), ...buildEnv };

    echo(`Pushing consolidated variables to environment ${envId}...`);
    await dp.environmentUpdate({
        body: { environmentId: envId, env: stringifyEnv(envObj) },
    });

    // 4. Map env vars into the app (referencing environment level)
    const appEnvString = Object.keys(envObj)
        .map((k) => k + '=${{environment.' + k + '}}\n')
        .join('');

    echo(`Sending all vars to app (${appId})...`);
    await dp.applicationSaveEnvironment({
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

    await dp.applicationSaveDockerProvider({
        body: {
            applicationId: appId,
            dockerImage: image,
            username: '',
            password: '',
            registryUrl: '',
        },
    });
    const deployRes = await dp.applicationDeploy({
        body: { applicationId: appId },
    });
    echo(`deploy response: ${JSON.stringify(deployRes)}`);
}
