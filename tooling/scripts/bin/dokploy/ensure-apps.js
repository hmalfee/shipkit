import path from 'node:path';

import { chalk, echo, fs, YAML } from 'zx';

import { dp } from './dp.js';
import {
    appendGeneratedVars,
    requireEnvironmentId,
    resolveAppConfig,
} from './utils.js';

async function resolveAppNames(appsDir) {
    const dir = path.resolve(appsDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkgPath = path.join(dir, entry.name, 'package.json');
        try {
            const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
            if (pkg.name) names.push(pkg.name);
        } catch {
            // no package.json or no .name — skip silently
        }
    }
    return names;
}

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

const WWW_REGEX = '^https?://www\\.(.+)';
const WWW_REPLACEMENT = 'https://${1}';

async function ensureDomainsAndRedirect({
    app,
    applicationId,
    projectName,
    baseDomain,
    staging,
    appsDir,
}) {
    const env = staging ? 'staging' : 'production';
    const cfg = await resolveAppConfig({
        appsDir,
        appName: app,
        projectName,
        baseDomain,
    });
    const { host } = cfg.domain[env];

    // Determine if it's an apex/www pair by comparing against baseDomain directly.
    // This is exact and TLD-agnostic — no dot-counting heuristics needed.
    // We normalize to lowercase for strict comparison.
    let bare = host.toLowerCase();
    let www = null;
    const normalizedBase = baseDomain.toLowerCase();

    if (bare === normalizedBase) {
        www = `www.${bare}`;
    } else if (bare === `www.${normalizedBase}`) {
        bare = normalizedBase;
        www = host.toLowerCase();
    }

    const existing = new Set(
        (
            (await dp.domainByApplicationId({ query: { applicationId } })) ?? []
        ).map((d) => d.host),
    );

    const domainsToEnsure = www ? [bare, www] : [host];

    for (const h of domainsToEnsure) {
        if (!existing.has(h)) {
            await dp.domainCreate({
                body: {
                    host: h,
                    port: 3000,
                    https: false,
                    certificateType: 'none',
                    path: '/',
                    applicationId,
                    domainType: 'application',
                },
            });
            echo(chalk.green(`  ${app} -> created domain http://${h}`));
        } else {
            echo(`  ${app} -> domain already exists: http://${h}`);
        }
    }

    // Configure www redirect if applicable
    if (www) {
        const appDetails = await dp.applicationOne({
            query: { applicationId },
        });
        if (
            !(appDetails.redirects ?? []).some(
                (r) =>
                    r.regex === WWW_REGEX && r.replacement === WWW_REPLACEMENT,
            )
        ) {
            await dp.redirectsCreate({
                body: {
                    regex: WWW_REGEX,
                    replacement: WWW_REPLACEMENT,
                    permanent: true,
                    applicationId,
                },
            });
            echo(
                chalk.green(
                    `  -> www redirect configured (www.${bare} -> ${bare})`,
                ),
            );
        }
    }

    return bare; // canonical domain
}

export async function ensureApps({
    projectId,
    appsDir = './apps',
    baseDomain,
    staging = false,
}) {
    const apps = await resolveAppNames(appsDir);
    if (apps.length === 0) {
        echo(chalk.yellow('No apps found in', appsDir, '. Skipping.'));
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
        const host = await ensureDomainsAndRedirect({
            app,
            applicationId,
            projectName,
            baseDomain: baseDomain,
            staging: Boolean(staging),
            appsDir,
        });

        if (staging) {
            await applyTraefikStagingConfig({ appId: applicationId });
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

async function applyTraefikStagingConfig({ appId }) {
    const app = await dp.applicationOne({ query: { applicationId: appId } });
    const { name: appName } = app;

    // Load existing config; fall back to empty object if it's missing/unparsable
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

    // Attach noindex to ALL primary routers (HTTP and HTTPS), skipping bypass routers
    const routerKeys = Object.keys(config.http.routers).filter(
        (k) =>
            k.startsWith(`${app.appName}-router`) &&
            !k.endsWith('-cors-bypass'),
    );
    for (const key of routerKeys) {
        const router = config.http.routers[key];
        router.middlewares ??= [];
        if (!router.middlewares.includes(noindexMiddlewareName)) {
            router.middlewares.push(noindexMiddlewareName);
        }

        // CORS preflight bypass: browsers never send credentials on OPTIONS,
        // so BasicAuth would 401 them. Higher-priority rule routes them around it.
        config.http.routers[`${key}-cors-bypass`] = {
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
            `  Traefik config updated for ${appName} (X-Robots-Tag: noindex, CORS bypass configured)`,
        ),
    );
}
