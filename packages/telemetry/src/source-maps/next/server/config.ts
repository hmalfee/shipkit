import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import FastGlob from 'fast-glob';

import type { NextConfig } from 'next';
import type * as fs from 'node:fs';
import type * as path from 'node:path';

import { logger } from '../../../logger';
import { createSqliteStore, DEFAULT_DB_PATH } from './store';

/**
 * A Next.js configuration wrapper that enables generating and capturing source maps
 * at build time for OpenTelemetry stack trace resolution.
 *
 * It hooks into the Turbopack build process to inject \`globalThis._debugIds\` into
 * client and server bundles, storing the actual \`.js.map\` files in a SQLite database.
 * (Note: This is specifically designed for Turbopack).
 *
 * @param nextConfig - Your existing Next.js configuration object.
 */
export function withTelemetrySourceMaps(nextConfig: NextConfig): NextConfig {
    return {
        ...nextConfig,
        turbopack: {
            ...nextConfig.turbopack,
            debugIds: true,
        },
        productionBrowserSourceMaps: true,
        experimental: {
            ...nextConfig.experimental,
            serverSourceMaps: true,
        },
        compiler: {
            ...nextConfig.compiler,
            runAfterProductionCompile: async (args) => {
                const { distDir } = args;
                const store = createSqliteStore(DEFAULT_DB_PATH);

                const mapFiles = await FastGlob(
                    join(distDir, '**', '*.{m,c,}js.map').replace(/\\/g, '/'),
                );

                for (const mapFile of mapFiles) {
                    try {
                        const raw = await readFile(mapFile, 'utf8');
                        const sourceMap = JSON.parse(raw) as {
                            debugId?: string;
                        };
                        if (sourceMap.debugId) {
                            store.put(sourceMap.debugId, raw);
                        }
                    } catch {
                        // skip malformed maps
                    } finally {
                        await rm(mapFile, { force: true });
                    }
                }

                store.close?.();

                // Delete CSS source maps
                const cssMapFiles = await FastGlob(
                    join(distDir, '**', '*.css.map').replace(/\\/g, '/'),
                );
                for (const mapFile of cssMapFiles) {
                    await rm(mapFile, { force: true });
                }

                // Strip sourceMappingURL from JS and CSS files
                const sourceFiles = await FastGlob(
                    join(distDir, '**', '*.{m,c,}js').replace(/\\/g, '/'),
                );
                for (const file of sourceFiles) {
                    try {
                        let content = await readFile(file, 'utf8');
                        if (content.includes('sourceMappingURL=')) {
                            content = content.replace(
                                /sourceMappingURL=[^ ]*\.js\.map/g,
                                '',
                            );
                            await writeFile(file, content, 'utf8');
                        }
                    } catch {}
                }

                const cssFiles = await FastGlob(
                    join(distDir, '**', '*.css').replace(/\\/g, '/'),
                );
                for (const file of cssFiles) {
                    try {
                        let content = await readFile(file, 'utf8');
                        if (content.includes('sourceMappingURL=')) {
                            content = content.replace(
                                /sourceMappingURL=[^ ]*\.css\.map/g,
                                '',
                            );
                            await writeFile(file, content, 'utf8');
                        }
                    } catch {}
                }

                // Copy to standalone directory at process exit, when standalone tracing has finished
                if (nextConfig.output === 'standalone') {
                    const standaloneDir = join(distDir, 'standalone');
                    process.on('exit', () => {
                        // oxlint-disable typescript/no-require-imports
                        const fsSync = require('node:fs') as typeof fs;
                        const pathSync = require('node:path') as typeof path;

                        // Find the .next directory inside standalone
                        const buildIds = FastGlob.sync(
                            `**/${pathSync.basename(distDir)}/BUILD_ID`,
                            { cwd: standaloneDir, absolute: true },
                        );

                        if (buildIds.length > 0 && buildIds[0]) {
                            const target = pathSync.join(
                                pathSync.dirname(buildIds[0]),
                                'sourcemaps.db',
                            );
                            if (fsSync.existsSync(DEFAULT_DB_PATH)) {
                                fsSync.copyFileSync(DEFAULT_DB_PATH, target);
                                logger.info(
                                    '✨ Copied sourcemaps.db to {target}',
                                    { target, alwaysLog: true },
                                );
                            }
                        }
                    });
                }

                await nextConfig.compiler?.runAfterProductionCompile?.(args);
            },
        },
    };
}
