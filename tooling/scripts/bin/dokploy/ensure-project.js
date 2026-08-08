import {
    environmentByProjectId,
    environmentCreate,
    projectAll,
    projectCreate,
} from '@dokploy/sdk';
import { chalk, echo } from 'zx';

import { appendGeneratedVars, unwrap } from './utils.js';

export async function ensureProject({ name, staging = false }) {
    const projects = unwrap(await projectAll(), 'Failed to list projects');
    let project = projects.find((p) => p.name === name);

    if (project) {
        echo(
            chalk.green(
                `  Project -> existing "${name}" (${project.projectId})`,
            ),
        );
    } else {
        await projectCreate({ body: { name, description: '' } });

        const updatedProjects = unwrap(
            await projectAll(),
            'Failed to list projects after creation',
        );
        project = updatedProjects.find((p) => p.name === name);

        if (!project) {
            throw new Error(`Failed to find newly created project: ${name}`);
        }

        echo(
            chalk.green(
                `  Project -> created "${name}" (${project.projectId})`,
            ),
        );
    }

    appendGeneratedVars([`DOKPLOY_PROJECT_ID=${project.projectId}`]);

    await ensureEnvironment(project.projectId, staging);

    return { projectId: project.projectId };
}

async function ensureEnvironment(projectId, staging) {
    if (!staging) {
        return;
    }

    const environments = unwrap(
        await environmentByProjectId({ query: { projectId } }),
        'Failed to list environments',
    );

    let env = environments.find((e) => e.name === 'staging');
    if (env?.environmentId) {
        echo(
            chalk.green(
                `  Environment -> existing "staging" (${env.environmentId})`,
            ),
        );
    } else {
        unwrap(
            await environmentCreate({
                body: { name: 'staging', projectId },
            }),
            `Failed to create staging environment`,
        );

        const updated = unwrap(
            await environmentByProjectId({ query: { projectId } }),
            'Failed to list environments after creation',
        );
        env = updated.find((e) => e.name === 'staging');
        if (!env?.environmentId) {
            throw new Error('Failed to find newly created staging environment');
        }
        echo(
            chalk.green(
                `  Environment -> created "staging" (${env.environmentId})`,
            ),
        );
    }
}
