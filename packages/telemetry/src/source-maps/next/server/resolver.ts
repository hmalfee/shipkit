import { SourceMapConsumer } from 'source-map-js';
import { parse as parseStackTrace } from 'stacktrace-parser';

import type { RawSourceMap } from 'source-map-js';

export interface SourceMapResolver {
    resolveStackTrace(stackTrace: string, debugIdMappings: string[]): string;
    close(): void;
}

function stripQuery(url: string): string {
    return url.split('?')[0]!;
}

// turbopack:///[project]/apps/web/src/app/page.tsx -> apps/web/src/app/page.tsx
// webpack:///./src/app/page.tsx               -> src/app/page.tsx
function cleanSourcePath(source: string): string {
    return decodeURIComponent(
        source
            .replace(/^[a-z-]+:\/{2,3}/i, '')
            .replace(/^\[[^\]]+\]\//, '')
            .replace(/^\.?\//, '')
            .replace(/^(?:\.\.\/)+/, ''),
    );
}

function guessFunctionName(
    sourceContent: string,
    errorLine: number,
): string | null {
    const lines = sourceContent.split('\n');
    const start = Math.max(0, errorLine - 50);
    const searchLines = lines.slice(start, errorLine);

    for (let i = searchLines.length - 1; i >= 0; i--) {
        const line = searchLines[i]!;

        const fnExec = /(?:async\s+)?function\s+\*?\s*(\w+)\s*\(/.exec(line);
        if (fnExec) return fnExec[1]!;

        const classExec =
            /class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s*\{|\s*<)/.exec(line);
        if (classExec) return classExec[1]!;

        const arrowExec =
            /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]\s*(?:React\.)?(?:FC|FunctionComponent)?\s*(?:<[^>]*>)?\s*=/.exec(
                line,
            );
        if (arrowExec) return arrowExec[1]!;

        const arrowFnExec =
            /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:(?:async\s+)?(?:\([^)]*\)|[^\s(]+)\s*=>|function)/.exec(
                line,
            );
        if (arrowFnExec) return arrowFnExec[1]!;

        const defaultExportExec =
            /export\s+default\s+(?:function|class)\s*/.exec(line);
        if (defaultExportExec) return 'default';
    }
    return null;
}

export function createSourceMapResolver(
    getSourceMap: (debugId: string) => string | null,
    maxCacheSize = 20,
): SourceMapResolver {
    const cache = new Map<string, SourceMapConsumer>();

    function loadConsumers(debugIds: string[]): Map<string, SourceMapConsumer> {
        const map = new Map<string, SourceMapConsumer>();
        for (const id of debugIds) {
            let consumer = cache.get(id);
            if (consumer) {
                cache.delete(id);
                cache.set(id, consumer);
            } else {
                const raw = getSourceMap(id);
                if (!raw) continue;
                consumer = new SourceMapConsumer(
                    JSON.parse(raw) as RawSourceMap,
                );
                if (cache.size >= maxCacheSize) {
                    const first = cache.keys().next().value;
                    if (first) {
                        cache.delete(first);
                    }
                }
                cache.set(id, consumer);
            }
            map.set(id, consumer);
        }
        return map;
    }

    function tryResolve(
        consumer: SourceMapConsumer,
        line: number | null,
        column: number | null,
        name: string | null,
        methodName: string | null,
    ): { frame: string; guessedName: string | null } | null {
        if (line == null) return null;
        try {
            const pos = consumer.originalPositionFor({
                line,
                // V8/Chrome stack traces use 1-based columns; source maps are 0-based
                column: column ? column - 1 : 0,
            });
            if (!pos.source) return null;

            let displayName = pos.name ?? methodName ?? null;

            if (
                !displayName ||
                displayName === '<unknown>' ||
                displayName.length <= 2
            ) {
                const sourceContent = consumer.sourceContentFor(
                    pos.source,
                    true,
                );
                if (sourceContent) {
                    const guessed = guessFunctionName(
                        sourceContent,
                        pos.line ?? 0,
                    );
                    if (guessed) {
                        displayName = guessed;
                    }
                }
            }

            const src = cleanSourcePath(pos.source);
            return {
                frame: `    at ${displayName ?? '<anonymous>'} (${src}:${pos.line}:${pos.column})`,
                guessedName: displayName ?? null,
            };
        } catch {
            return null; // malformed mapping — fall through to original frame
        }
    }

    function resolveStackTrace(
        stackTrace: string,
        debugIdMappings: string[],
    ): string {
        const urlToId = new Map<string, string>();
        const uniqueIds = new Set<string>();
        for (const mapping of debugIdMappings) {
            const eqIdx = mapping.lastIndexOf('=');
            if (eqIdx > -1) {
                const url = mapping.slice(0, eqIdx);
                const id = mapping.slice(eqIdx + 1);
                urlToId.set(url, id);
                uniqueIds.add(id);
            }
        }

        const consumers = loadConsumers([...uniqueIds]);
        if (!consumers.size) return stackTrace;

        const frames = parseStackTrace(stackTrace);
        const lines = stackTrace.split('\n');
        const msgLines: string[] = [];
        for (const line of lines) {
            if (/^\s+at |^[^\s@]*@\S+:\d+/.test(line)) break;
            msgLines.push(line);
        }

        const resolvedFrames: string[] = [];
        for (const frame of frames) {
            let resolved: string | null = null;

            if (frame.file) {
                const fileUrl = stripQuery(frame.file);
                const id = urlToId.get(fileUrl);
                if (id) {
                    const consumer = consumers.get(id);
                    if (consumer) {
                        const result = tryResolve(
                            consumer,
                            frame.lineNumber,
                            frame.column,
                            frame.methodName,
                            frame.methodName,
                        );
                        if (result) {
                            resolved = result.frame;
                        }
                    }
                }
            }

            resolvedFrames.push(
                resolved ??
                    `    at ${frame.methodName ?? '<anonymous>'} (${frame.file}:${frame.lineNumber}:${frame.column})`,
            );
        }

        const collapsed: string[] = [];
        for (const line of resolvedFrames) {
            if (collapsed.at(-1) === line) continue;
            collapsed.push(line);
        }

        return [...msgLines, ...collapsed].join('\n');
    }

    function close() {
        cache.clear();
    }

    return { resolveStackTrace, close };
}
