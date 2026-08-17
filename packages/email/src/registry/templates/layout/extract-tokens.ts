import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { formatHex, formatHex8, parse as parseColor } from 'culori';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import type { Container, Root } from 'postcss';

// react-email's preview UI runs in CJS mode where import.meta.url is
// undefined but __filename is injected as a module-scoped CJS variable.
// In ESM (server runtime), import.meta.url is defined instead.
declare const __filename: string;
const _moduleRef =
    typeof import.meta.url !== 'undefined' ? import.meta.url : __filename;
const req = createRequire(_moduleRef);
const CSS_PATH = req.resolve('@shipkit/ui/globals.css');

const REM_PX = 16;

/** Single pass over the top-level nodes, collecting custom properties from
 *  `:root` and `@theme` (light mode only — emails lock to light). */
function collectVariables(root: Root): {
    root: Map<string, string>;
    theme: Map<string, string>;
} {
    const result = {
        root: new Map<string, string>(),
        theme: new Map<string, string>(),
    };
    const collectInto = (container: Container, target: Map<string, string>) => {
        container.walkDecls((decl) => {
            if (!decl.prop.startsWith('--')) return;
            // skip no-op self-referential aliases some scaffolds emit,
            // e.g. `--radius: var(--radius)`
            if (decl.value.trim() === `var(${decl.prop})`) return;
            target.set(decl.prop, decl.value.replace(/\s+/g, ' ').trim());
        });
    };
    root.each((node) => {
        if (node.type === 'rule' && node.selector === ':root') {
            collectInto(node, result.root);
        } else if (node.type === 'atrule' && node.name === 'theme') {
            // covers both `@theme { }` and `@theme inline { }`
            collectInto(node, result.theme);
        }
    });
    return result;
}

/** Recursively resolves `var(--x, fallback)` references against `map`,
 *  preferring the referenced variable and falling back only when it's
 *  missing or would recurse into itself. Unresolvable references (no
 *  match, no fallback) are left as literal `var(...)` text, same as a
 *  browser would leave them for the next cascade layer to handle. */
function resolveValue(
    raw: string,
    map: Map<string, string>,
    visited = new Set<string>(),
): string {
    const parsed = valueParser(raw);
    parsed.walk((node) => {
        if (node.type !== 'function' || node.value !== 'var') return;
        const commaIndex = node.nodes.findIndex(
            (n) => n.type === 'div' && n.value === ',',
        );
        const nameNodes =
            commaIndex === -1 ? node.nodes : node.nodes.slice(0, commaIndex);
        const fallbackNodes =
            commaIndex === -1 ? null : node.nodes.slice(commaIndex + 1);
        const name = valueParser.stringify(nameNodes).trim();
        const fallback = fallbackNodes
            ? valueParser.stringify(fallbackNodes).trim()
            : null;

        const replacement =
            !visited.has(name) && map.has(name)
                ? resolveValue(map.get(name)!, map, new Set(visited).add(name))
                : fallback !== null
                  ? resolveValue(fallback, map, visited)
                  : null;

        if (replacement !== null) {
            Object.assign(node, {
                type: 'word',
                value: replacement,
                nodes: undefined,
            });
        }
        return false; // already resolved (or intentionally left) — don't descend further
    });
    return valueParser.stringify(parsed.nodes);
}

function toHexColor(value: string): string | null {
    const parsed = parseColor(value);
    if (!parsed) return null;
    const isOpaque = parsed.alpha === undefined || parsed.alpha >= 1;
    return isOpaque
        ? (formatHex(parsed) ?? null)
        : (formatHex8(parsed) ?? null);
}

/** rem/px `calc()` addition only, matching border-radius scales. */
function toPx(resolved: string): string {
    if (resolved.startsWith('calc(')) {
        const tokens = resolved
            .slice(5, -1)
            .match(/[+-]?\s*[\d.]+\s*(rem|px)/g);
        if (!tokens) return resolved;
        const totalPx = tokens.reduce((sum, token) => {
            const t = token.replace(/\s+/g, '');
            const n = parseFloat(t);
            return sum + (t.endsWith('rem') ? n * REM_PX : n);
        }, 0);
        return `${totalPx}px`;
    }
    if (resolved.endsWith('rem')) return `${parseFloat(resolved) * REM_PX}px`;
    return resolved;
}

export function extractTokens(): {
    colors: Record<string, string>;
    borderRadius: Record<string, string>;
} {
    const css = readFileSync(CSS_PATH, 'utf8');
    const root = postcss.parse(css);

    const { root: rootVars, theme: themeVars } = collectVariables(root);
    const lightMap = new Map([...rootVars, ...themeVars]);

    const colors: Record<string, string> = {};
    for (const [key, rawValue] of themeVars) {
        const name = /^--color-(.+)$/.exec(key)?.[1];
        if (!name) continue;
        const resolved = resolveValue(rawValue, lightMap);
        colors[name] = toHexColor(resolved) ?? resolved;
    }

    const borderRadius: Record<string, string> = {};
    for (const size of ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']) {
        const rawValue = themeVars.get(`--radius-${size}`);
        if (rawValue === undefined) continue;
        const pxValue = toPx(resolveValue(rawValue, lightMap));
        borderRadius[size] = pxValue.startsWith('-') ? '0px' : pxValue;
    }
    borderRadius.full = '9999px';

    return { colors, borderRadius };
}
