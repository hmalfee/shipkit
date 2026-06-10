import type { OxlintConfig } from 'oxlint';

/**
 * Default selectors for `eslint-js/no-restricted-syntax`.
 * Spread into your override when you need to add additional selectors
 * without losing the base restrictions (e.g., process.env).
 *
 * The `*\/src\/env.ts` exemption is handled by base.ts overrides
 * and flows through `extends` automatically.
 */
export const defaultNoRestrictedSyntaxRules = [
    {
        selector:
            "MemberExpression[object.name='process'][property.name='env']",
        message:
            "Do not use process.env directly. Use createEnv from '@mento-mark/env' to create a validated env instance.",
    },
] as const;

const config: OxlintConfig = {
    jsPlugins: ['oxlint-plugin-eslint'], // enables using "eslint-js/no-restricted-syntax" rules
    options: {
        typeAware: true,
        typeCheck: true,
        reportUnusedDisableDirectives: 'warn',
        respectEslintDisableDirectives: false,
    },
    rules: {
        // ============================================================
        // ESLint core rules & overrides
        // ============================================================
        'no-array-constructor': 'error',
        'no-unused-expressions': 'error',
        'no-empty-function': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error',
        'no-unused-vars': [
            'warn',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                destructuredArrayIgnorePattern: '^_',
            },
        ],
        'no-console': 'warn',

        // default no-restricted-syntax rules
        'eslint-js/no-restricted-syntax': [
            'error',
            ...defaultNoRestrictedSyntaxRules,
        ],
    },
    overrides: [
        {
            files: ['**/*.{ts,tsx}'],
            plugins: ['typescript'],
            rules: {
                // ============================================================
                // RECOMMENDED
                // ============================================================
                'typescript/ban-ts-comment': 'error',
                'typescript/no-duplicate-enum-values': 'error',
                'typescript/no-empty-object-type': 'error',
                'typescript/no-explicit-any': 'error',
                'typescript/no-extra-non-null-assertion': 'error',
                'typescript/no-misused-new': 'error',
                'typescript/no-namespace': 'error',
                'typescript/no-non-null-asserted-optional-chain': 'error',
                'typescript/no-require-imports': 'error',
                'typescript/no-this-alias': 'error',
                'typescript/no-unnecessary-type-constraint': 'error',
                'typescript/no-unsafe-declaration-merging': 'error',
                'typescript/no-unsafe-function-type': 'error',
                'typescript/no-wrapper-object-types': 'error',
                'typescript/prefer-as-const': 'error',
                'typescript/prefer-namespace-keyword': 'error',
                'typescript/triple-slash-reference': 'error',

                // ============================================================
                // RECOMMENDED TYPE CHECKED
                // ============================================================
                'typescript/await-thenable': 'error',
                'typescript/no-array-delete': 'error',
                'typescript/no-base-to-string': 'error',
                'typescript/no-duplicate-type-constituents': 'error',
                'typescript/no-floating-promises': 'error',
                'typescript/no-for-in-array': 'error',
                'typescript/no-implied-eval': 'error',
                'typescript/no-redundant-type-constituents': 'error',
                'typescript/no-unnecessary-type-assertion': 'error',
                'typescript/no-unsafe-argument': 'error',
                'typescript/no-unsafe-assignment': 'error',
                'typescript/no-unsafe-call': 'error',
                'typescript/no-unsafe-enum-comparison': 'error',
                'typescript/no-unsafe-member-access': 'error',
                'typescript/no-unsafe-return': 'error',
                'typescript/no-unsafe-unary-minus': 'error',
                'typescript/only-throw-error': 'error',
                'typescript/prefer-promise-reject-errors': 'error',
                'typescript/restrict-plus-operands': 'error',
                'typescript/restrict-template-expressions': 'error',
                'typescript/unbound-method': 'error',

                // ============================================================
                // STYLISTIC
                // ============================================================
                'typescript/adjacent-overload-signatures': 'error',
                'typescript/ban-tslint-comment': 'error',
                'typescript/class-literal-property-style': 'error',
                'typescript/consistent-generic-constructors': 'error',
                'typescript/consistent-indexed-object-style': 'error',
                'typescript/consistent-type-assertions': 'error',
                'typescript/no-confusing-non-null-assertion': 'error',
                'typescript/no-inferrable-types': 'error',
                'typescript/prefer-for-of': 'error',
                'typescript/prefer-function-type': 'error',

                // ============================================================
                // STYLISTIC TYPE CHECKED
                // ============================================================
                'typescript/dot-notation': 'error',
                'typescript/non-nullable-type-assertion-style': 'error',
                'typescript/prefer-find': 'error',
                'typescript/prefer-includes': 'error',
                'typescript/prefer-nullish-coalescing': 'error',
                'typescript/prefer-optional-chain': 'error',
                'typescript/prefer-regexp-exec': 'error',
                'typescript/prefer-string-starts-ends-with': 'error',

                // ============================================================
                // Overrides
                // ============================================================
                'typescript/no-misused-promises': [
                    'error',
                    { checksVoidReturn: { attributes: false } },
                ],
                'typescript/require-await': 'off',
                'typescript/array-type': 'off',
                'typescript/consistent-type-definitions': 'off',
                'typescript/consistent-type-imports': [
                    'warn',
                    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
                ],
            },
        },
        {
            files: ['**/src/env.ts'],
            rules: {
                'eslint-js/no-restricted-syntax': 'off',
            },
        },
    ],
};

export default config;
