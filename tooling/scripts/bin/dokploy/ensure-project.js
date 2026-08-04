import { projectAll, projectCreate } from '@dokploy/sdk';
import { chalk, echo } from 'zx';

import { appendGeneratedVars, unwrap } from './utils.js';

export async function ensureProject({ name }) {
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

        // Fetch all projects again to get the newly created one
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

    return project.projectId;
}
