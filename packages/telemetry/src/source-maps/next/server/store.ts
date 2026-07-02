import { join } from 'node:path';

import Database from 'better-sqlite3';

function getDefaultDbPath(): string {
    let nextDir = '.next';

    // In Next.js standalone mode, the configuration is passed via environment variable
    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    if (process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
        try {
            const config = JSON.parse(
                // oxlint-disable-next-line eslint-js/no-restricted-syntax
                process.env.__NEXT_PRIVATE_STANDALONE_CONFIG,
            ) as { distDir?: string };
            if (config.distDir) {
                nextDir = config.distDir;
            }
        } catch {
            // ignore JSON parse errors
        }
    }

    return join(process.cwd(), nextDir, 'sourcemaps.db');
}

export const DEFAULT_DB_PATH = getDefaultDbPath();

export interface SourceMapStore {
    get(debugId: string): string | null;
    put(debugId: string, sourceMap: string): void;
    close(): void;
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
