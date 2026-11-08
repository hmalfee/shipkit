import path from 'node:path';

import { chalk, echo, fs } from 'zx';

import { dokploy as dp } from '../../lib/dokploy/index.js';
import { appendGeneratedVars } from './utils.js';

export async function ensureProject({ projectDir = '.', staging = false }) {
    let name;
    try {
        const pkgPath = path.resolve(projectDir, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        if (!pkg.name) {
            throw new Error(
                `package.json in ${projectDir} is missing "name" property.`,
            );
        }
        name = pkg.name;
    } catch (err) {
        throw new Error(
            `Could not determine project name from ${projectDir}: ${err.message}`,
        );
    }

    const projects = await dp.project.All();
    let project = projects.find((p) => p.name === name);

    if (project) {
        echo(
            chalk.green(
                `  Project -> existing "${name}" (${project.projectId})`,
            ),
        );
    } else {
        await dp.project.Create({ body: { name, description: '' } });

        const updatedProjects = await dp.project.All();
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

    const environments = await dp.environment.ByProjectId({
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
        await dp.environment.Create({
            body: { name: 'staging', projectId },
        });

        const updated = await dp.environment.ByProjectId({
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
