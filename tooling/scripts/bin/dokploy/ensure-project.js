import { chalk, echo } from 'zx';

import { dp } from './dp.js';
import { appendGeneratedVars } from './utils.js';

export async function ensureProject({ name, staging = false }) {
    const projects = await dp.projectAll();
    let project = projects.find((p) => p.name === name);

    if (project) {
        echo(
            chalk.green(
                `  Project -> existing "${name}" (${project.projectId})`,
            ),
        );
    } else {
        await dp.projectCreate({ body: { name, description: '' } });

        const updatedProjects = await dp.projectAll();
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

    const environments = await dp.environmentByProjectId({
        query: { projectId },
    });

    let env = environments.find((e) => e.name === 'staging');
    if (env?.environmentId) {
        echo(
            chalk.green(
                `  Environment -> existing "staging" (${env.environmentId})`,
            ),
        );
    } else {
        await dp.environmentCreate({
            body: { name: 'staging', projectId },
        });

        const updated = await dp.environmentByProjectId({
            query: { projectId },
        });
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
