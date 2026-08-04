import {
    applicationDeploy,
    applicationSaveDockerProvider,
    applicationUpdate,
    projectOne,
    projectUpdate,
} from '@dokploy/sdk';
import { chalk, echo, fs } from 'zx';

import { parseEnv, stringifyEnv, unwrap } from './utils.js';

export async function deploy({ projectId, appId, image, envFile }) {
    // 1. Resolve project
    echo('Fetching project...');
    const project = unwrap(
        await projectOne({ query: { projectId } }),
        'Failed to fetch project',
    );
    const envObj = parseEnv(project.env);

    // 2. Read explicit env file
    if (!fs.existsSync(envFile)) {
        echo(chalk.red(`Env file not found: ${envFile}`));
        process.exit(1);
    }
    echo(`Merging environment from ${envFile}`);
    const fileContents = fs.readFileSync(envFile, 'utf-8');
    const buildEnv = parseEnv(fileContents);

    for (const [k, v] of Object.entries(buildEnv)) {
        envObj[k] = v;
    }

    echo(`Pushing consolidated variables to project ${projectId}...`);
    const projectEnvString = stringifyEnv(envObj);
    unwrap(
        await projectUpdate({
            body: { projectId, env: projectEnvString },
        }),
        'Failed to update project env',
    );

    // 3. Map project vars into the app (single call, referencing project level)
    const appEnvString = Object.keys(envObj)
        .map((k) => k + '=${{project.' + k + '}}\n')
        .join('');

    echo(`Sending all vars to app (${appId}) in one API call...`);
    await applicationUpdate({
        body: { applicationId: appId, env: appEnvString },
    });

    // 4. Deploy app
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
