import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { faker } from '@faker-js/faker';
import { is, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { z } from 'zod';

import { normalizeEmail, sanitizeEmail } from '@shipkit/auth/email-validation';
import { createEnv } from '@shipkit/env';

import * as schema from '../src/pg/schema';

const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = createEnv({
    envDir: path.join(__dirname, '../../../apps/server'),
    server: {
        POSTGRES_URL: z.url(),
        REDIS_URL: z.url(),
        NODE_ENV: z.string().optional(),
        SEED_EMAIL: z.email().optional(),
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

// Seed fake public data to populate the app with realistic content.
async function seedBulkData() {
    for (let i = 0; i < 10; i++) {
        const userId = faker.string.uuid();
        const userTs = fakeTimestamps();
        const email = faker.internet.email();
        const [user] = await db
            .insert(schema.users)
            .values({
                id: userId,
                name: faker.person.fullName(),
                email,
                displayEmail: email,
                emailVerified: faker.datatype.boolean({ probability: 0.8 }),
                image: null,
                roles: ['user'],
                ...userTs,
            })
            .returning();

        if (!user) throw new Error('Failed to create seeded user');

        const todos = generateTodos(user.id, randomTodoCount());
        await db.insert(schema.todos).values(todos);
    }
}

// Seed your own dev account — update SEED_EMAIL or fallback to a demo email.
async function seedDemoUser() {
    await db.transaction(async (tx) => {
        const demoId = faker.string.uuid();
        const userTs = fakeTimestamps();
        const email = env.SEED_EMAIL ?? 'demo@example.com';
        const sanitizedEmail = sanitizeEmail(email);
        const normalizedEmail = normalizeEmail(sanitizedEmail);
        const [demoUser] = await tx
            .insert(schema.users)
            .values({
                id: demoId,
                name: 'Demo User',
                email: normalizedEmail,
                displayEmail: sanitizedEmail,
                emailVerified: true,
                roles: ['admin'],
                ...userTs,
            })
            .returning();

        if (!demoUser) throw new Error('Failed to create demo user');

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
    console.log(`\n${YELLOW}Demo User:${RESET}`);
    console.log(`Email: ${env.SEED_EMAIL ?? 'demo@example.com'}\n`);
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
