import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['./src/index.ts', './src/instrument.ts'],
    outDir: './dist',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    deps: {
        alwaysBundle: [/.*/],
    },
    sourcemap: true,
    minify: true,
});
