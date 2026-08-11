import type { Config } from 'prettier';

const config: Config = {
    tabWidth: 4,
    semi: true,
    singleQuote: true,
    plugins: [
        '@ianvs/prettier-plugin-sort-imports',
        'prettier-plugin-tailwindcss',
        'prettier-plugin-packagejson',
        'prettier-plugin-sh',
        'prettier-plugin-sql',
    ],

    // prettier-plugin-sql options
    language: 'postgresql',

    // @ianvs/prettier-plugin-sort-imports options
    importOrder: [
        '<BUILTIN_MODULES>', // Node.js internals (fs, path, etc.)
        '',
        '<THIRD_PARTY_MODULES>', // External deps (react, next, lodash)
        '',
        // 1. Shared Monorepo Packages (Internal Workspace)
        '^@shipkit/(.*)$',
        '',
        // 2. App-local Path Aliases (Absolute)
        '^~/(.*)$',
        '^@/(.*)$',
        '',
        // 3. Types (Separated for clarity)
        '<TYPES>',
        '<TYPES>^[./]',
        '',
        // 4. Relative imports (Last)
        '^[./]',
    ],
    importOrderTypeScriptVersion: '6.0.0',
    importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
    importOrderCaseSensitive: false,

    overrides: [
        {
            files: ['.npmrc', '.env*'],
            options: {
                parser: 'sh',
            },
        },
    ],
};

export default config;
