import type { OxlintConfig } from 'oxlint';

const config: OxlintConfig = {
    jsPlugins: [
        {
            name: 'react-x-js',
            specifier: 'eslint-plugin-react-x',
        },
        {
            name: 'react-hooks-js',
            specifier: 'eslint-plugin-react-hooks',
        },
    ],
    rules: {
        // We omit `react-hooks-js/rules-of-hooks` and `react-hooks-js/exhaustive-deps`
        // because they are already handled natively (and faster) by oxlint's built-in
        // react plugin in the `next` preset (`react/rules-of-hooks` & `react/exhaustive-deps`).

        // We use eslint-plugin-react-x for the majority of the compiler diagnostic rules
        // because it is much faster and actively maintained for performance.
        'react-x-js/static-components': 'error',
        'react-x-js/use-memo': 'error',
        'react-x-js/immutability': 'error',
        'react-x-js/globals': 'error',
        'react-x-js/refs': 'error',
        'react-x-js/set-state-in-effect': 'error',
        'react-x-js/error-boundaries': 'error',
        'react-x-js/purity': 'error',
        'react-x-js/set-state-in-render': 'error',
        'react-x-js/unsupported-syntax': 'warn',

        // We retain eslint-plugin-react-hooks ONLY for these 4 compiler-specific rules
        // because eslint-plugin-react-x intentionally does not provide equivalents for them.
        'react-hooks-js/preserve-manual-memoization': 'error',
        'react-hooks-js/incompatible-library': 'warn',
        'react-hooks-js/config': 'error',
        'react-hooks-js/gating': 'error',
    },
};

export default config;
