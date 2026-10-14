import { defineConfig } from 'oxlint';

import base, {
    defaultNoRestrictedSyntaxRules,
} from '@shipkit/oxlint-config/base';

export default defineConfig({
    extends: [base],
    overrides: [
        {
            files: ['src/**/*.ts'],
            rules: {
                'eslint-js/no-restricted-imports': [
                    'error',
                    {
                        patterns: [
                            {
                                group: ['@orpc/*'],
                                message:
                                    'apps/server must not import @orpc directly. Use @shipkit/orpc-utils instead.',
                            },
                        ],
                    },
                ],
            },
        },
        {
            files: ['src/api/**/*.ts'],
            rules: {
                'eslint-js/no-restricted-syntax': [
                    'error',
                    ...defaultNoRestrictedSyntaxRules,
                ],
            },
        },
        {
            files: ['src/api/router/**/*.ts'],
            rules: {
                'eslint-js/no-restricted-syntax': [
                    'error',
                    ...defaultNoRestrictedSyntaxRules,
                    {
                        selector:
                            "ThrowStatement:not([argument.callee.object.name='errors'])",
                        message:
                            "Do not throw errors directly. Use the 'errors' object from the handler context ({ context, input, errors }) instead.",
                    },
                ],
            },
        },
    ],
});
