import { randomBytes } from 'node:crypto';

import { chalk, echo, YAML } from 'zx';

import { dp } from './dp.js';
import { appendGeneratedVars, requireEnvironmentId } from './utils.js';

async function ensureApplication({ envId, applications, app }) {
    const existing = applications.find((a) => a.name === app);
    if (existing) {
        echo(`  ${app} -> existing application ${existing.applicationId}`);
        return {
            applicationId: existing.applicationId,
            appName: existing.appName,
        };
    }

    const created = await dp.applicationCreate({
        body: { name: app, appName: app, environmentId: envId },
    });
    if (!created.applicationId) {
        echo(
            chalk.red(
                `application.create did not return an applicationId for ${app}.`,
            ),
        );
        process.exit(1);
    }
    echo(`  ${app} -> created application ${created.applicationId}`);
    return { applicationId: created.applicationId, appName: undefined };
}

async function ensureDomain({
    app,
    applicationId,
    projectName,
    baseDomain,
    staging,
}) {
    const domains =
        (await dp.domainByApplicationId({ query: { applicationId } })) ?? [];
    if (domains[0]?.host) {
        echo(`  ${app} -> domain already exists: http://${domains[0].host}`);
        return domains[0].host;
    }

    let resolvedBaseDomain = baseDomain;
    if (!resolvedBaseDomain) {
        const settings = await dp.settingsGetWebServerSettings();
        resolvedBaseDomain = settings.host;
    }
    if (!resolvedBaseDomain) {
        echo(
            chalk.red(
                'No base domain available. Pass --base-domain or configure host in Dokploy settings.',
            ),
        );
        process.exit(1);
    }

    const host = `${app}-${projectName}${staging ? '-staging' : ''}.${resolvedBaseDomain}`;
    await dp.domainCreate({
        body: {
            host,
            port: 3000,
            https: false,
            certificateType: 'none',
            path: '/',
            applicationId,
            domainType: 'application',
        },
    });
    echo(chalk.green(`  ${app} -> created domain http://${host}`));
    return host;
}

export async function ensureApps({
    projectId,
    apps,
    baseDomain,
    staging = false,
}) {
    if (!apps || apps.length === 0) {
        echo(chalk.yellow('No apps provided. Skipping.'));
        return;
    }
    echo('Apps to ensure:', apps);

    const project = await dp.projectOne({ query: { projectId } });
    const projectName = project.name;
    const envId = requireEnvironmentId(
        project,
        staging ? 'staging' : 'production',
    );
    const applications =
        project.environments?.find((e) => e.environmentId === envId)
            ?.applications ?? [];

    const lines = [];

    for (const app of apps) {
        const { applicationId, appName: existingAppName } =
            await ensureApplication({ envId, applications, app });
        const host = await ensureDomain({
            app,
            applicationId,
            projectName,
            baseDomain: baseDomain,
            staging: Boolean(staging),
        });

        if (staging) {
            await applyStagingSecurity({ appId: applicationId });
        }

        const appDetails = await dp.applicationOne({
            query: { applicationId },
        });
        const appName = existingAppName || appDetails.appName;

        const key = app.toUpperCase().replace(/-/g, '_');
        lines.push(
            `APP_ID_${key}=${applicationId}`,
            `INTERNAL_${key}_URL=http://${appName}:3000`,
            `${key}_URL=http://${host}`,
        );
        echo(
            `  ${app} -> APP_ID=${applicationId} internal=http://${appName}:3000 public=http://${host}`,
        );
    }

    appendGeneratedVars(lines);
}

async function applyStagingSecurity({ appId }) {
    const app = await dp.applicationOne({ query: { applicationId: appId } });
    const { name: appName } = app;

    // Reset security entries for a clean slate
    for (const sec of app.security ?? []) {
        await dp.securityDelete({ body: { securityId: sec.securityId } });
    }

    const username = 'staging';
    const password = randomBytes(16).toString('hex');
    await dp.securityCreate({
        body: { applicationId: appId, username, password },
    });
    echo(
        chalk.cyan(
            `  Basic auth for ${appName} -> username: ${username}  password: ${password}`,
        ),
    );

    // Load existing config; fall back to empty object if it's missing/unparsable
    // applicationReadTraefikConfig uses raw API response object in case of parsing errors
    const data = await dp.applicationReadTraefikConfig({
        query: { applicationId: appId },
    });
    const currentConfigStr =
        typeof data === 'string' ? data : (data?.traefikConfig ?? '');
    let config;
    try {
        config = YAML.parse(currentConfigStr) || {};
    } catch (e) {
        echo(
            chalk.yellow(
                `  Warning: could not parse existing Traefik config for ${appName}, overwriting. (${e.message})`,
            ),
        );
        config = {};
    }

    config.http ??= {};
    config.http.middlewares ??= {};
    config.http.routers ??= {};

    const noindexMiddlewareName = `${appName}-staging-noindex`;
    config.http.middlewares[noindexMiddlewareName] = {
        headers: {
            customResponseHeaders: {
                'X-Robots-Tag': 'noindex, nofollow, noarchive',
            },
        },
    };

    // Attach noindex to the primary router (skip our own bypass router)
    const routerKey = Object.keys(config.http.routers).find(
        (k) => !k.endsWith('-cors-bypass'),
    );
    if (routerKey) {
        const router = config.http.routers[routerKey];
        router.middlewares ??= [];
        if (!router.middlewares.includes(noindexMiddlewareName)) {
            router.middlewares.push(noindexMiddlewareName);
        }

        // CORS preflight bypass: browsers never send credentials on OPTIONS,
        // so BasicAuth would 401 them. Higher-priority rule routes them around it.
        config.http.routers[`${appName}-staging-cors-bypass`] = {
            rule: `${router.rule} && Method(\`OPTIONS\`)`,
            service: router.service,
            entryPoints: router.entryPoints,
            middlewares: [noindexMiddlewareName],
            ...(router.tls && { tls: router.tls }),
        };
    }

    await dp.applicationUpdateTraefikConfig({
        body: { applicationId: appId, traefikConfig: YAML.stringify(config) },
    });
    echo(
        chalk.cyan(
            `  Traefik config updated for ${appName} (X-Robots-Tag: noindex, Basic Auth: enabled)`,
        ),
    );
}
