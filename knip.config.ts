import type { KnipConfig } from 'knip';

const config: KnipConfig = {
    ignoreDependencies: [/eslint|prettier|oxlint|tailwindcss|commitlint|tsx/i], // Ignore dependencies (and related dependencies to these dependencies) that are used implicitly and not directly imported in the codebase.
    workspaces: {
        // root workspace
        '.': {
            entry: ['./turbo/generators/config.ts'],
        },
        'tooling/scripts': {
            entry: ['bin/*.js', 'bin/**/index.js'],
        },
    },
    exclude: ['optionalPeerDependencies'], // Allows setting peer dependencies as optional
    treatConfigHintsAsErrors: true,
    treatTagHintsAsErrors: true,
};

export default config;
