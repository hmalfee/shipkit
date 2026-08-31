import { copyFileSync, existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import FastGlob from 'fast-glob';

import type { NextConfig } from 'next';

import { logger } from '../../../logger';
import { createSqliteStore, defaultSourceMapDbPath } from './store';

async function stripSourceMappingComments(
    distDir: string,
    glob: string,
    mapUrlPattern: RegExp,
): Promise<void> {
    const files = await FastGlob(join(distDir, '**', glob).replace(/\\/g, '/'));
    for (const file of files) {
        try {
            let content = await readFile(file, 'utf8');
            if (content.includes('sourceMappingURL=')) {
                content = content.replace(mapUrlPattern, '');
                await writeFile(file, content, 'utf8');
            }
        } catch (err) {
            logger.local.debug(
                '[telemetry] Could not strip sourceMappingURL from {file}',
                {
                    file,
                    err,
                },
            );
        }
    }
}

/**
 * Wraps next.config to inject the source-map upload webpack plugin. Call in next.config.ts — has no effect at runtime.
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
                const dbPath = defaultSourceMapDbPath();
                const store = createSqliteStore(dbPath);

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
                    } catch (err) {
                        logger.local.debug(
                            '[telemetry] Could not strip sourceMappingURL from {file}',
                            { file: mapFile, err },
                        );
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

                await stripSourceMappingComments(
                    distDir,
                    '*.{m,c,}js',
                    /sourceMappingURL=[^ ]*\.js\.map/g,
                );
                await stripSourceMappingComments(
                    distDir,
                    '*.css',
                    /sourceMappingURL=[^ ]*\.css\.map/g,
                );

                // Copy to standalone directory at process exit, when standalone tracing has finished
                if (nextConfig.output === 'standalone') {
                    const standaloneDir = join(distDir, 'standalone');
                    process.on('exit', () => {
                        // Find the .next directory inside standalone
                        const buildIds = FastGlob.sync(
                            `**/${basename(distDir)}/BUILD_ID`,
                            { cwd: standaloneDir, absolute: true },
                        );

                        if (buildIds.length > 0 && buildIds[0]) {
                            const target = join(
                                dirname(buildIds[0]),
                                'sourcemaps.db',
                            );
                            if (existsSync(dbPath)) {
                                copyFileSync(dbPath, target);
                                logger.local.info(
                                    '[telemetry] ✨ Copied sourcemaps.db to {target}',
                                    { target },
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
