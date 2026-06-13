import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaDir = path.join(__dirname, './src/pg/schema');

const env = createEnv({
    envDir: path.join(__dirname, '../../apps/server'),
    server: {
        POSTGRES_URL: z.url(),
        NODE_ENV: z.string().optional(),
    },
});

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/pg/schema/index.ts',
    out: './src/pg/migrations',
    dbCredentials: {
        url: env.POSTGRES_URL,
    },
    schemaFilter: fs
        .readdirSync(schemaDir, { withFileTypes: true })
        .filter((dirent) => {
            if (dirent.isFile()) {
                return (
                    dirent.name !== 'index.ts' && dirent.name.endsWith('.ts')
                );
            }
            if (dirent.isDirectory()) {
                const indexTsPath = path.join(
                    schemaDir,
                    dirent.name,
                    'index.ts',
                );
                return fs.existsSync(indexTsPath);
            }
            return false;
        })
        .map((dirent) =>
            dirent.isFile() ? path.basename(dirent.name, '.ts') : dirent.name,
        ),
});
