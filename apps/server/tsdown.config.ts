import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['./src/index.ts', './src/env.ts', './src/instrument.ts'],
    outDir: './dist',
    deps: {
        alwaysBundle: [/@mento-mark\/.*/],
    },
    sourcemap: true,
    minify: true,
});
