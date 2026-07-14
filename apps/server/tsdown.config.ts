import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['./src/index.ts', './src/instrument.ts'],
    outDir: './dist',
    deps: {
        alwaysBundle: [/@shipkit\/.*/],
    },
    sourcemap: true,
    minify: true,
});
