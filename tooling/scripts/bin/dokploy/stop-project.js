import { chalk, echo } from 'zx';

import { dp } from './dp.js';
import { requireEnvironmentId } from './utils.js';

export async function stopProject({ projectId, staging = false }) {
    const project = await dp.projectOne({ query: { projectId } });

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
            await dp.applicationStop({
                body: { applicationId: app.applicationId },
            });
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
            await dp.postgresStop({ body: { postgresId: db.postgresId } });
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
            await dp.redisStop({ body: { redisId: db.redisId } });
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
            await dp.mongoStop({ body: { mongoId: db.mongoId } });
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
