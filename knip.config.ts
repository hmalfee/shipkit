import type { KnipConfig } from 'knip';

const config: KnipConfig = {
    ignoreDependencies: [/eslint|prettier|oxlint|tailwindcss/i], // Ignore dependencies (and related dependencies to these dependencies) that are used implicitly and not directly imported in the codebase.
    workspaces: {
        // root workspace
        '.': {
            entry: ['./turbo/generators/config.ts'],
        },
        'tooling/scripts': {
            entry: ['bin/**/*.js'],
        },
    },
    exclude: ['optionalPeerDependencies'], // Allows setting peer dependencies as optional
};

export default config;
