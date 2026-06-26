import type { OxlintConfig } from 'oxlint';

const config: OxlintConfig = {
    jsPlugins: [
        {
            name: 'react-hooks-js',
            specifier: 'eslint-plugin-react-hooks',
        },
    ],
    rules: {
        // We omit `react-hooks-js/rules-of-hooks` and `react-hooks-js/exhaustive-deps`
        // because they are already handled natively (and faster) by oxlint's built-in
        // react plugin in the `next` preset (`react/rules-of-hooks` & `react/exhaustive-deps`).
        'react-hooks-js/static-components': 'error',
        'react-hooks-js/use-memo': 'error',
        'react-hooks-js/preserve-manual-memoization': 'error',
        'react-hooks-js/incompatible-library': 'warn',
        'react-hooks-js/immutability': 'error',
        'react-hooks-js/globals': 'error',
        'react-hooks-js/refs': 'error',
        'react-hooks-js/set-state-in-effect': 'error',
        'react-hooks-js/error-boundaries': 'error',
        'react-hooks-js/purity': 'error',
        'react-hooks-js/set-state-in-render': 'error',
        'react-hooks-js/unsupported-syntax': 'warn',
        'react-hooks-js/config': 'error',
        'react-hooks-js/gating': 'error',
    },
};

export default config;
