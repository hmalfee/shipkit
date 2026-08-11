import path from 'node:path';

import z from 'zod';
import { chalk, echo, fs } from 'zx';

import schema from './schema.json' with { type: 'json' };

export function parseEnv(envString) {
    const env = {};
    for (const line of (envString || '').split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    }
    return env;
}

export function stringifyEnv(envObj) {
    const lines = Object.entries(envObj).map(([k, v]) => `${k}=${v}`);
    return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

export function requireEnvironmentId(project, envName = 'production') {
    const envId = project.environments?.find(
        (e) => e.name === envName,
    )?.environmentId;
    if (!envId) {
        echo(chalk.red(`Could not resolve "${envName}" environmentId`));
        process.exit(1);
    }
    return envId;
}

export function appendGeneratedVars(lines) {
    if (!process.env.DOKPLOY_GENERATED) {
        echo(
            chalk.yellow(
                'Warning: DOKPLOY_GENERATED is not set, variables will not be saved.',
            ),
        );
        return;
    }
    fs.appendFileSync(process.env.DOKPLOY_GENERATED, lines.join('\n') + '\n');
}

const DokploySchema = z.fromJSONSchema(schema);

export async function resolveAppConfig({
    appsDir,
    appName,
    projectName,
    baseDomain,
}) {
    const cfgPath = path.join(path.resolve(appsDir), appName, 'dokploy.json');
    try {
        let rawJson = await fs.readFile(cfgPath, 'utf8');
        rawJson = rawJson
            .replace(/\$\{APP_NAME\}/g, appName)
            .replace(/\$\{PROJECT_NAME\}/g, projectName)
            .replace(/\$\{BASE_DOMAIN\}/g, baseDomain);

        return DokploySchema.parse(JSON.parse(rawJson));
    } catch (err) {
        echo(chalk.red(`  Invalid or missing ${cfgPath}: ${err.message}`));
        process.exit(1);
    }
}
