import { defineConfig } from 'oxlint';

import base, {
    defaultNoRestrictedSyntaxRules,
} from '@shipkit/oxlint-config/base';

export default defineConfig({
    extends: [base],
    overrides: [
        {
            files: ['src/api/**/*.ts'],
            rules: {
                'eslint-js/no-restricted-imports': [
                    'error',
                    {
                        paths: [
                            {
                                name: '@orpc/server',
                                importNames: ['os'],
                                message:
                                    "Do not import 'os' directly. Import it from 'src/api/base.ts' instead.",
                            },
                        ],
                    },
                ],
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
