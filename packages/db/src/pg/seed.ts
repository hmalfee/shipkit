// oxlint-disable no-console
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { faker } from '@faker-js/faker';
import { is, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { z } from 'zod';

import { createEnv } from '@shipkit/env';

import * as schema from './schema';

const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = createEnv({
    envDir: path.join(__dirname, '../../../../apps/server'),
    server: {
        POSTGRES_URL: z.url(),
        REDIS_URL: z.url(),
        NODE_ENV: z.string().optional(),
    },
});

// Guard against accidentally wiping a production database.
if (env.NODE_ENV === 'production') {
    console.error(`${RED}✖ Refusing to seed a production database${RESET}`);
    process.exit(1);
}

const pool = new Pool({ connectionString: env.POSTGRES_URL });
const db = drizzle(pool, { schema });
const redis = new Redis(env.REDIS_URL);

// Extract only actual pgTable objects (drop relations exports, enums, and
// the auth PgSchema namespace object)
const seedTables = Object.values(schema).filter((value) =>
    is(value, PgTable),
) as PgTable[];

// scrypt hash for 'password123'
const PASSWORD_HASH =
    '1393ab90d7c2bca6bfeb5e108b6b13bf:a49c1b29306071b57c46238573a42d2d10fe887ed7687e88d62ee774afe02faa0249249e375c362186ab0922683e3488e12647a81e135a5bf88bb9b0a41af777';

const TODO_TITLES = [
    'Buy groceries',
    'Schedule dentist appointment',
    'Review pull request #42',
    'Update project README',
    'Call the insurance company',
    'Finish reading "Clean Code"',
    'Pay monthly bills',
    'Plan team retrospective',
    'Fix flaky CI test',
    'Book flight tickets',
    'Renew car registration',
    'Write weekly report',
    'Organize desk',
    'Set up 2FA on all accounts',
    'Back up laptop',
    'Meow, meow!',
    'Bark, bark!',
    'Gomenasai, I am a human!',
];

async function resetDatabase() {
    const qualifiedNames = seedTables.map((table) => {
        const { schema: schemaName, name } = getTableConfig(table);
        return schemaName ? `"${schemaName}"."${name}"` : `"${name}"`;
    });
    await db.execute(
        sql.raw(`TRUNCATE TABLE ${qualifiedNames.join(', ')} CASCADE;`),
    );
}

function randomTodoCount() {
    const buckets = [
        { weight: 0.3, min: 70, max: 79 },
        { weight: 0.4, min: 80, max: 89 },
        { weight: 0.2, min: 90, max: 99 },
        { weight: 0.1, min: 100, max: 103 },
    ];
    const r = faker.number.float();
    let cumulative = 0;
    for (const bucket of buckets) {
        cumulative += bucket.weight;
        if (r <= cumulative) {
            return faker.number.int({ min: bucket.min, max: bucket.max });
        }
    }
    return buckets.at(-1)!.max;
}

function fakeTimestamps() {
    const createdAt = faker.date.past({ years: 2 });
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() });
    return { createdAt, updatedAt };
}

function generateTodos(userId: string, count: number) {
    return Array.from({ length: count }, () => ({
        id: faker.string.uuid(),
        userId,
        title: faker.helpers.arrayElement(TODO_TITLES),
        completed: faker.datatype.boolean({ probability: 0.4 }),
        ...fakeTimestamps(),
    }));
}

async function seedBulkData() {
    for (let i = 0; i < 10; i++) {
        const userId = faker.string.uuid();
        const userTs = fakeTimestamps();
        const [user] = await db
            .insert(schema.users)
            .values({
                id: userId,
                name: faker.person.fullName(),
                email: faker.internet.email(),
                emailVerified: faker.datatype.boolean({ probability: 0.8 }),
                image: null,
                roles: ['user'],
                ...userTs,
            })
            .returning();

        if (!user) throw new Error('Failed to create seeded user');

        const accountTs = fakeTimestamps();
        await db.insert(schema.accounts).values({
            id: faker.string.uuid(),
            accountId: faker.string.uuid(),
            providerId: 'credential',
            userId: user.id,
            password: PASSWORD_HASH,
            accessToken: null,
            refreshToken: null,
            ...accountTs,
        });

        const todos = generateTodos(user.id, randomTodoCount());
        await db.insert(schema.todos).values(todos);
    }
}

async function seedDemoUser() {
    await db.transaction(async (tx) => {
        const demoId = faker.string.uuid();
        const userTs = fakeTimestamps();
        const [demoUser] = await tx
            .insert(schema.users)
            .values({
                id: demoId,
                name: 'Demo User',
                email: 'demo@example.com',
                emailVerified: true,
                roles: ['admin'],
                ...userTs,
            })
            .returning();

        if (!demoUser) throw new Error('Failed to create demo user');

        const accountTs = fakeTimestamps();
        await tx.insert(schema.accounts).values({
            id: faker.string.uuid(),
            accountId: demoUser.id,
            providerId: 'credential',
            userId: demoUser.id,
            password: PASSWORD_HASH,
            ...accountTs,
        });

        const todos = generateTodos(demoUser.id, randomTodoCount());
        await tx.insert(schema.todos).values(todos);
    });
}

async function main() {
    faker.seed(42); // one seed for the whole run — deterministic across bulk + demo user

    console.log(`${YELLOW}◷ Resetting database...${RESET}`);
    await resetDatabase();

    console.log(`${YELLOW}◷ Seeding database...${RESET}`);
    await seedBulkData();
    await seedDemoUser();

    console.log(`${YELLOW}◷ Flushing Redis cache...${RESET}`);
    await redis.flushall();

    console.log(`${GREEN}✔ Database seeded successfully${RESET}`);
    console.log(`\n${YELLOW}Demo User Credentials:${RESET}`);
    console.log(`Email:    demo@example.com`);
    console.log(`Password: password123\n`);
}

async function run() {
    try {
        await main();
    } catch (err) {
        console.error(`${RED}✖ Error seeding database${RESET}`, err);
        process.exitCode = 1;
    } finally {
        await pool.end();
        redis.disconnect();
    }
}

void run();
