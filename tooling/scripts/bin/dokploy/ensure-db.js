import { randomBytes } from 'crypto';

import { chalk, echo } from 'zx';

import { dp } from './dp.js';
import { appendGeneratedVars, requireEnvironmentId } from './utils.js';

const rndPass = () => randomBytes(16).toString('hex');

async function waitUntilRunning(
    fetchFn,
    id,
    label,
    interval = 4000,
    timeout = 180000,
) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const record = await fetchFn(id);
        if (
            record.applicationStatus === 'running' ||
            record.applicationStatus === 'done'
        ) {
            return record;
        }
        if (record.applicationStatus === 'error') {
            throw new Error(`${label} entered error state`);
        }
        await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(
        `Timed out (${timeout / 1000}s) waiting for ${label} to be running`,
    );
}

// Everything that differs between Postgres / Redis / MongoDB lives here;
// the create-or-reuse-then-wait-then-read flow below is fully shared.
const DB_TYPES = {
    postgres: {
        label: 'Postgres',
        idField: 'postgresId',
        search: (q) => dp.postgresSearch(q),
        create: (b) => dp.postgresCreate(b),
        deploy: (b) => dp.postgresDeploy(b),
        one: (q) => dp.postgresOne(q),
        buildCreateBody: (envId) => ({
            name: 'postgres',
            databaseName: 'app',
            databaseUser: 'app',
            databasePassword: rndPass(),
            environmentId: envId,
        }),
        buildEnvLines: (db) => [
            `POSTGRES_APP_NAME=${db.appName}`,
            `POSTGRES_USER=${db.databaseUser}`,
            `POSTGRES_PASSWORD=${db.databasePassword}`,
            `POSTGRES_DB=${db.databaseName}`,
            `POSTGRES_URL=postgresql://${db.databaseUser}:${db.databasePassword}@${db.appName}:5432/${db.databaseName}`,
        ],
    },
    redis: {
        label: 'Redis',
        idField: 'redisId',
        search: (q) => dp.redisSearch(q),
        create: (b) => dp.redisCreate(b),
        deploy: (b) => dp.redisDeploy(b),
        one: (q) => dp.redisOne(q),
        buildCreateBody: (envId) => ({
            name: 'redis',
            databasePassword: rndPass(),
            environmentId: envId,
        }),
        buildEnvLines: (db) => [
            `REDIS_URL=redis://default:${db.databasePassword ?? db.password}@${db.appName}:6379`,
        ],
    },
    mongodb: {
        label: 'MongoDB',
        idField: 'mongoId',
        search: (q) => dp.mongoSearch(q),
        create: (b) => dp.mongoCreate(b),
        deploy: (b) => dp.mongoDeploy(b),
        one: (q) => dp.mongoOne(q),
        buildCreateBody: (envId) => ({
            name: 'mongodb',
            databaseUser: 'app',
            databasePassword: rndPass(),
            environmentId: envId,
        }),
        buildEnvLines: (db) => [
            `MONGO_APP_NAME=${db.appName}`,
            `MONGO_USER=${db.databaseUser}`,
            `MONGO_PASSWORD=${db.databasePassword}`,
            `MONGO_URL=mongodb://${db.databaseUser}:${db.databasePassword}@${db.appName}:27017`,
        ],
    },
};

async function ensureDatabase(type, { projectId, envId }) {
    const cfg = DB_TYPES[type];
    echo(`Verifying ${cfg.label} instance...`);

    const allItems = (await cfg.search({ query: { projectId } })).items ?? [];
    const items = allItems.filter((item) => item.environmentId === envId);

    if (items.length > 1) {
        echo(
            chalk.red(
                `Found multiple (${items.length}) ${cfg.label} instances. Ensure there is only one.`,
            ),
        );
        process.exit(1);
    }

    let db;
    if (items.length === 1) {
        echo(
            chalk.green(
                `  ${cfg.label} -> existing instance ${items[0][cfg.idField]}`,
            ),
        );
        db = items[0];
    } else {
        const created = await cfg.create({ body: cfg.buildCreateBody(envId) });
        echo(
            chalk.green(
                `  ${cfg.label} -> created instance ${created[cfg.idField]}`,
            ),
        );

        await cfg.deploy({ body: { [cfg.idField]: created[cfg.idField] } });

        db = { [cfg.idField]: created[cfg.idField], applicationStatus: 'idle' };
    }

    if (db.applicationStatus !== 'running') {
        echo(`  Waiting for ${cfg.label} to be running...`);
        db = await waitUntilRunning(
            (id) => cfg.one({ query: { [cfg.idField]: id } }),
            db[cfg.idField],
            cfg.label,
        );
        echo(chalk.green(`  ${cfg.label} is running!`));
    } else {
        db = await cfg.one({ query: { [cfg.idField]: db[cfg.idField] } });
    }

    return cfg.buildEnvLines(db);
}

export async function ensureDb({ projectId, dbs, staging = false }) {
    const project = await dp.projectOne({ query: { projectId } });
    const envId = requireEnvironmentId(
        project,
        staging ? 'staging' : 'production',
    );

    const lines = [];
    for (const type of ['postgres', 'redis', 'mongodb']) {
        if (dbs[type]) {
            lines.push(...(await ensureDatabase(type, { projectId, envId })));
        }
    }

    appendGeneratedVars(lines);
}
