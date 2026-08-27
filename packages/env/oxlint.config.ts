import { defineConfig } from 'oxlint';

import base from '@shipkit/oxlint-config/base';

export default defineConfig({
    extends: [base],
    overrides: [
        {
            files: ['src/**'],
            rules: {
                'eslint-js/no-restricted-syntax': 'off',
                'no-console': 'off',
            },
        },
    ],
});
