import { chalk, echo, fs } from 'zx';

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
