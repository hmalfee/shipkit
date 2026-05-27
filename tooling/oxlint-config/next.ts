import type { OxlintConfig } from 'oxlint';

export default {
    plugins: ['react', 'nextjs', 'jsx-a11y', 'import'],
    jsPlugins: [
        {
            name: 'react-js',
            specifier: 'eslint-plugin-react',
        },
    ],
    rules: {
        // ============================================================
        // Next.js
        // ============================================================
        // warnings
        'nextjs/google-font-display': 'warn',
        'nextjs/google-font-preconnect': 'warn',
        'nextjs/next-script-for-ga': 'warn',
        'nextjs/no-async-client-component': 'warn',
        'nextjs/no-before-interactive-script-outside-document': 'warn',
        'nextjs/no-css-tags': 'warn',
        'nextjs/no-head-element': 'warn',
        'nextjs/no-html-link-for-pages': 'error', // From core-web-vitals
        'nextjs/no-img-element': 'warn',
        'nextjs/no-page-custom-font': 'warn',
        'nextjs/no-styled-jsx-in-document': 'warn',
        'nextjs/no-sync-scripts': 'error', // From core-web-vitals
        'nextjs/no-title-in-document-head': 'warn',
        'nextjs/no-typos': 'warn',
        'nextjs/no-unwanted-polyfillio': 'warn',
        // errors
        'nextjs/inline-script-id': 'error',
        'nextjs/no-assign-module-variable': 'error',
        'nextjs/no-document-import-in-page': 'error',
        'nextjs/no-duplicate-head': 'error',
        'nextjs/no-head-import-in-document': 'error',
        'nextjs/no-script-component-in-head': 'error',

        // ============================================================
        // React Recommended
        // ============================================================
        'react/display-name': 'error',
        'react/jsx-key': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-duplicate-props': 'error',
        'react/jsx-no-target-blank': 'off', // overridden by next
        'react/jsx-no-undef': 'error',
        'react/no-children-prop': 'error',
        'react/no-danger-with-children': 'error',
        'react/no-direct-mutation-state': 'error',
        'react/no-find-dom-node': 'error',
        'react/no-is-mounted': 'error',
        'react/no-render-return-value': 'error',
        'react/no-string-refs': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unknown-property': 'off', // overridden by next
        'react/require-render-return': 'error',
        'react/react-in-jsx-scope': 'off', // overridden by next

        // ============================================================
        // React Hooks
        // ============================================================
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'warn',

        // ============================================================
        // React (JS plugin parity)
        // ============================================================
        'react-js/no-deprecated': 'error',

        // ============================================================
        // jsx-a11y (core-web-vitals)
        // ============================================================
        'jsx-a11y/alt-text': [
            'warn',
            {
                elements: ['img'],
                img: ['Image'],
            },
        ],
        'jsx-a11y/aria-props': 'warn',
        'jsx-a11y/aria-proptypes': 'warn',
        'jsx-a11y/aria-unsupported-elements': 'warn',
        'jsx-a11y/role-has-required-aria-props': 'warn',
        'jsx-a11y/role-supports-aria-props': 'warn',

        // ============================================================
        // Import
        // ============================================================
        'import/no-anonymous-default-export': 'warn',
    },
} satisfies OxlintConfig;
