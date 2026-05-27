import { defineConfig } from 'oxlint';

import base from '@mento-mark/oxlint-config/base';

export default defineConfig({
    extends: [base],
    overrides: [
        {
            files: ['src/pg/schema/**/*.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: [
                            {
                                name: 'drizzle-orm/pg-core',
                                importNames: ['pgTable'],
                                message:
                                    "Please use the custom pgTable created with pgSchema('...').table instead of importing it directly from drizzle-orm/pg-core. This ensures tables are correctly placed in their respective PostgreSQL schemas.",
                            },
                        ],
                    },
                ],
            },
        },
        {
            files: ['src/pg/schema/public.ts'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: [
                            {
                                name: 'drizzle-orm/pg-core',
                                importNames: ['pgSchema'],
                                message:
                                    "The public schema is the default in PostgreSQL. Use pgTable directly from 'drizzle-orm/pg-core' instead of creating a custom schema.",
                            },
                        ],
                    },
                ],
            },
        },
    ],
});
