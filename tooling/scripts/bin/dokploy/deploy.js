import { createHash, randomBytes } from 'node:crypto';

import { chalk, echo, fs, YAML } from 'zx';

import { dp } from './dp.js';
import { parseEnv, stringifyEnv } from './utils.js';

export async function deploy({ appId, image, envFile, staging = false }) {
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

    if (staging) {
        await applyCredentials({ appId });
    }
}

async function applyCredentials({ appId }) {
    const app = await dp.applicationOne({ query: { applicationId: appId } });

    const username = randomBytes(4).toString('hex');
    const password = randomBytes(16).toString('hex');

    const hash = createHash('sha1').update(password).digest('base64');
    const htpasswd = `${username}:{SHA}${hash}`;

    const data = await dp.applicationReadTraefikConfig({
        query: { applicationId: appId },
    });
    const currentConfigStr =
        typeof data === 'string' ? data : (data?.traefikConfig ?? '');
    let config;
    try {
        config = YAML.parse(currentConfigStr) || {};
    } catch (e) {
        config = {};
    }

    config.http ??= {};
    config.http.middlewares ??= {};
    config.http.routers ??= {};

    const authMiddlewareName = `${app.name}-staging-auth`;
    config.http.middlewares[authMiddlewareName] = {
        basicAuth: {
            users: [htpasswd],
        },
    };

    // Attach auth middleware to ALL primary routers (HTTP and HTTPS) but explicitly skip bypass routers
    const routerKeys = Object.keys(config.http.routers).filter(
        (k) =>
            k.startsWith(`${app.appName}-router`) &&
            !k.endsWith('-cors-bypass'),
    );
    for (const key of routerKeys) {
        const router = config.http.routers[key];
        router.middlewares ??= [];
        if (!router.middlewares.includes(authMiddlewareName)) {
            router.middlewares.push(authMiddlewareName);
        }
    }

    await dp.applicationUpdateTraefikConfig({
        body: { applicationId: appId, traefikConfig: YAML.stringify(config) },
    });

    echo('\n');
    echo(chalk.bgCyan.black.bold(' 🔒 STAGING CREDENTIALS '));
    echo(chalk.cyan(`  App:      ${chalk.white.bold(app.name)}`));
    echo(chalk.cyan(`  Username: ${chalk.green.bold(username)}`));
    echo(chalk.cyan(`  Password: ${chalk.green.bold(password)}`));
    echo('\n');
}
