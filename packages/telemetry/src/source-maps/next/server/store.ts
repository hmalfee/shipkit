import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import type { SourceMapResolver } from './resolver';

import { logger } from '../../../logger';
import { createSourceMapResolver } from './resolver';

export interface SourceMapStore {
    get(debugId: string): string | null;
    put(debugId: string, sourceMap: string): void;
    close(): void;
}

export function defaultSourceMapDbPath(): string {
    let nextDir = '.next';
    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    const standaloneConfig = process.env.__NEXT_PRIVATE_STANDALONE_CONFIG;

    if (standaloneConfig) {
        try {
            const config = JSON.parse(standaloneConfig) as { distDir?: string };
            if (config.distDir) {
                nextDir = config.distDir;
            }
        } catch {
            // ignore JSON parse errors
        }
    }

    return join(process.cwd(), nextDir, 'sourcemaps.db');
}

export function createSqliteStore(dbPath: string): SourceMapStore {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS sourcemaps (
            debug_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL
        )
    `);

    const getStmt = db.prepare(
        'SELECT payload FROM sourcemaps WHERE debug_id = ?',
    );
    const putStmt = db.prepare(
        'INSERT OR REPLACE INTO sourcemaps (debug_id, payload) VALUES (?, ?)',
    );

    return {
        get(debugId: string): string | null {
            const row = getStmt.get(debugId) as { payload: string } | undefined;
            return row?.payload ?? null;
        },
        put(debugId: string, sourceMap: string): void {
            putStmt.run(debugId, sourceMap);
        },
        close(): void {
            db.close();
        },
    };
}

const resolverCache = new Map<string, SourceMapResolver | null>();
let exitHookRegistered = false;

export function getSharedSourceMapResolver(
    dbPath: string,
): SourceMapResolver | null {
    const key = resolve(dbPath); // normalize so relative vs absolute paths don't double-open
    if (resolverCache.has(key)) return resolverCache.get(key) ?? null;

    if (!existsSync(key)) {
        logger.warn(
            '[telemetry] DB not found at {dbPath}. Stack traces will not be resolved.',
            { dbPath: key },
        );
        resolverCache.set(key, null);
        return null;
    }

    try {
        const store = createSqliteStore(key);
        const resolver = createSourceMapResolver((id) => store.get(id));
        resolverCache.set(key, resolver);
        if (!exitHookRegistered) {
            exitHookRegistered = true;
            process.on('exit', closeSharedSourceMapResolvers);
        }
        return resolver;
    } catch (err) {
        logger.error('[telemetry] Failed to open DB at {dbPath}: {err}', {
            dbPath: key,
            err,
        });
        resolverCache.set(key, null);
        return null;
    }
}

/** Closes every cached resolver/SQLite connection. Idempotent. */
function closeSharedSourceMapResolvers(): void {
    for (const resolver of resolverCache.values()) resolver?.close();
    resolverCache.clear();
}
