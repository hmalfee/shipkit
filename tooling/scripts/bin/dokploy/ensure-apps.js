import {
    applicationCreate,
    applicationOne,
    domainByApplicationId,
    domainCreate,
    projectOne,
    settingsGetWebServerSettings,
} from '@dokploy/sdk';
import { chalk, echo } from 'zx';

import {
    appendGeneratedVars,
    requireProductionEnvironmentId,
    unwrap,
} from './utils.js';

// Ensures a single application exists, creating it if needed.
// appName is only populated for pre-existing apps — matching the original
// "resolve appName on demand via applicationOne for new apps" behavior.
async function ensureApplication({ envId, applications, app }) {
    const existing = applications.find((a) => a.name === app);
    if (existing) {
        echo(`  ${app} -> existing application ${existing.applicationId}`);
        return {
            applicationId: existing.applicationId,
            appName: existing.appName,
        };
    }

    const created = unwrap(
        await applicationCreate({
            body: { name: app, appName: app, environmentId: envId },
        }),
        `Failed to create app ${app}`,
    );
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

// Ensures a domain exists for the application, creating one if needed.
async function ensureDomain({ app, applicationId, projectName, baseDomain }) {
    const domains =
        (await domainByApplicationId({ query: { applicationId } })).data ?? [];
    if (domains[0]?.host) {
        echo(`  ${app} -> domain already exists: http://${domains[0].host}`);
        return domains[0].host;
    }

    let resolvedBaseDomain = baseDomain;
    if (!resolvedBaseDomain) {
        const settings = unwrap(
            await settingsGetWebServerSettings(),
            'Failed to get web server settings',
        );
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

    const host = `${app}-${projectName}.${resolvedBaseDomain}`;
    await domainCreate({
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

export async function ensureApps({ projectId, apps, baseDomain }) {
    if (!apps || apps.length === 0) {
        echo(chalk.yellow('No apps provided. Skipping.'));
        return;
    }
    echo('Apps to ensure:', apps);

    const project = unwrap(
        await projectOne({ query: { projectId } }),
        'Failed to fetch project',
    );
    const projectName = project.name;
    const envId = requireProductionEnvironmentId(project);
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
            baseDomain,
        });

        // Resolve swarm appName (needed for internal URL)
        const appName =
            existingAppName ||
            unwrap(
                await applicationOne({ query: { applicationId } }),
                `Failed to fetch details for ${app}`,
            ).appName;

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
