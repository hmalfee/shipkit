import {
    applicationStop,
    mongoStop,
    postgresStop,
    projectOne,
    redisStop,
} from '@dokploy/sdk';
import { chalk, echo } from 'zx';

import { requireEnvironmentId, unwrap } from './utils.js';

export async function stopProject({ projectId, staging = false }) {
    const project = unwrap(
        await projectOne({ query: { projectId } }),
        'Failed to fetch project',
    );

    const envName = staging ? 'staging' : 'production';
    const envId = requireEnvironmentId(project, envName);
    const env = project.environments?.find((e) => e.environmentId === envId);
    if (!env) {
        echo(chalk.red(`Could not find "${envName}" environment in project`));
        process.exit(1);
    }

    for (const app of env.applications ?? []) {
        echo(`  Stopping app ${app.name}...`);
        try {
            unwrap(
                await applicationStop({
                    body: { applicationId: app.applicationId },
                }),
                'Failed',
            );
            echo(chalk.green(`  Stopped app ${app.name}`));
        } catch (e) {
            echo(
                chalk.yellow(
                    `  Failed to stop app ${app.name} (maybe already stopped)`,
                ),
            );
        }
    }

    for (const db of env.postgres ?? []) {
        echo(`  Stopping postgres ${db.name}...`);
        try {
            unwrap(
                await postgresStop({ body: { postgresId: db.postgresId } }),
                'Failed',
            );
            echo(chalk.green(`  Stopped postgres ${db.name}`));
        } catch (e) {
            echo(
                chalk.yellow(
                    `  Failed to stop postgres ${db.name} (maybe already stopped)`,
                ),
            );
        }
    }

    for (const db of env.redis ?? []) {
        echo(`  Stopping redis ${db.name}...`);
        try {
            unwrap(
                await redisStop({ body: { redisId: db.redisId } }),
                'Failed',
            );
            echo(chalk.green(`  Stopped redis ${db.name}`));
        } catch (e) {
            echo(
                chalk.yellow(
                    `  Failed to stop redis ${db.name} (maybe already stopped)`,
                ),
            );
        }
    }

    for (const db of env.mongos ?? []) {
        echo(`  Stopping mongo ${db.name}...`);
        try {
            unwrap(
                await mongoStop({ body: { mongoId: db.mongoId } }),
                'Failed',
            );
            echo(chalk.green(`  Stopped mongo ${db.name}`));
        } catch (e) {
            echo(
                chalk.yellow(
                    `  Failed to stop mongo ${db.name} (maybe already stopped)`,
                ),
            );
        }
    }
}
