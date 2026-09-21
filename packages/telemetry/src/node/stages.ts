import { trace } from '@opentelemetry/api';

import type { Context, SpanContext } from '@opentelemetry/api';
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import type { SpanPipelineStage } from '../processor-base';

// ─── Internal helpers ──────────────────────────────────────────────────────────

function getParentSpanContext(span: ReadableSpan): SpanContext | undefined {
    return (span as unknown as { parentSpanContext?: SpanContext })
        .parentSpanContext;
}

function setParentSpanContext(span: ReadableSpan, ctx: SpanContext): void {
    (span as unknown as { parentSpanContext: SpanContext }).parentSpanContext =
        ctx;
}

function dropIfStage(
    name: string,
    predicate: (span: ReadableSpan) => boolean,
): SpanPipelineStage {
    return { name, onEnd: (span) => (predicate(span) ? 'drop' : 'keep') };
}

// ─── Scope filter + reparent ───────────────────────────────────────────────────

export function scopeFilterStage(options: { ignoredScopes?: string[] }): {
    filter: SpanPipelineStage;
    reparent: SpanPipelineStage;
} {
    const ignoredScopes = options.ignoredScopes ?? [];
    const droppedSpanParents = new Map<string, SpanContext | undefined>();

    return {
        filter: {
            name: 'scope-filter',
            onStart(span: Span, ctx: Context) {
                if (!ignoredScopes.length) return;
                const ownScope = (span as unknown as ReadableSpan)
                    .instrumentationScope?.name;
                if (ownScope && ignoredScopes.includes(ownScope)) {
                    const parentSpan = trace.getSpan(ctx);
                    droppedSpanParents.set(
                        span.spanContext().spanId,
                        parentSpan?.spanContext(),
                    );
                }
            },
            onEnd(span: ReadableSpan) {
                if (ignoredScopes.includes(span.instrumentationScope.name)) {
                    droppedSpanParents.delete(span.spanContext().spanId);
                    return 'drop';
                }
                return 'keep';
            },
        },
        reparent: {
            name: 'scope-reparent',
            onEnd(span: ReadableSpan) {
                const currentParentId = getParentSpanContext(span)?.spanId;
                if (
                    currentParentId &&
                    droppedSpanParents.has(currentParentId)
                ) {
                    let ancestorCtx = droppedSpanParents.get(currentParentId);
                    while (
                        ancestorCtx &&
                        droppedSpanParents.has(ancestorCtx.spanId)
                    ) {
                        ancestorCtx = droppedSpanParents.get(
                            ancestorCtx.spanId,
                        );
                    }
                    if (ancestorCtx) setParentSpanContext(span, ancestorCtx);
                }
                return 'keep';
            },
        },
    };
}

// ─── Redaction ─────────────────────────────────────────────────────────────────

const URL_LIKE_ATTRS = [
    'http.url',
    'http.target',
    'url.full',
    'url.path',
    'next.span_name',
] as const;

const SENSITIVE_SEGMENT_RE =
    /^(?:[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|[\w-]{20,})$/;

function redactPath(value: string): string {
    const [path] = value.split('?');
    return path!
        .split('/')
        .map((seg) => (SENSITIVE_SEGMENT_RE.test(seg) ? ':redacted' : seg))
        .join('/');
}

export function redactionStage(): SpanPipelineStage {
    return {
        name: 'redaction',
        onEnd(span: ReadableSpan) {
            const redactedName = redactPath(span.name);
            if (redactedName !== span.name)
                (span as unknown as { name: string }).name = redactedName;

            for (const key of URL_LIKE_ATTRS) {
                const val = span.attributes[key];
                if (typeof val === 'string') {
                    const redacted = redactPath(val);
                    if (redacted !== val) span.attributes[key] = redacted;
                }
            }
            if ('url.query' in span.attributes)
                delete span.attributes['url.query'];
            return 'keep';
        },
    };
}

// ─── Next.js stages ────────────────────────────────────────────────────────────
// All Next.js-specific constants, helpers, and stages live below this line.
// Nothing above imports from here — the gating is entirely via `enabled`.

const NOISY_NEXT_SPAN_TYPES = new Set([
    'NextNodeServer.getLayoutOrPageModule',
    'NextNodeServer.createComponentTree',
    'NextNodeServer.findPageComponents',
    'NextNodeServer.startResponse',
    'NextNodeServer.clientComponentLoading',
    'NextNodeServer.getRequestHandler',
]);
const NEXT_IGNORED_URLS = ['registry.npmjs.org'];
const NEXT_IGNORED_PATHS = ['/_next/', '__nextjs_', '.hot-update.', '_rsc='];

function isNoisyNextSpan(span: ReadableSpan): boolean {
    const spanType = span.attributes['next.span_type'];
    if (typeof spanType === 'string' && NOISY_NEXT_SPAN_TYPES.has(spanType))
        return true;
    const url = span.attributes['http.url'] ?? span.attributes['url.full'];
    if (
        typeof url === 'string' &&
        NEXT_IGNORED_URLS.some((u) => url.includes(u))
    )
        return true;
    const target =
        span.attributes['http.target'] ?? span.attributes['url.path'];
    if (
        typeof target === 'string' &&
        NEXT_IGNORED_PATHS.some((p) => target.includes(p))
    )
        return true;
    return false;
}

function enrichNextSpan(span: ReadableSpan): void {
    const spanType = span.attributes['next.span_type'];
    if (typeof spanType !== 'string') return;

    let route = span.attributes['http.route'];
    const nextRoute = span.attributes['next.route'];
    if (typeof nextRoute === 'string') {
        route ??= nextRoute;
        span.attributes['http.route'] = route;
    }

    const method = span.attributes['http.method'];
    const attrs = span.attributes;

    if (spanType === 'BaseServer.handleRequest') {
        attrs['operation.name'] =
            typeof method === 'string' ? method : 'HTTP_REQUEST';
        if (typeof route === 'string') {
            attrs['resource.name'] = route;
            if (
                attrs['next.rsc'] &&
                typeof method === 'string' &&
                !span.name.startsWith('RSC ')
            ) {
                (span as unknown as { name: string }).name =
                    `RSC ${method} ${route}`;
            }
        }
    } else {
        attrs['operation.name'] = `next_js.${spanType}`;
    }
}

/**
 * Next.js internal-noise filter + span enrichment.
 * Both stages are no-ops when `enabled` is false.
 */
export function nextJsStages(options: { enabled?: boolean }): {
    noiseFilter: SpanPipelineStage;
    enrich: SpanPipelineStage;
} {
    const enabled = options.enabled ?? false;
    return {
        noiseFilter: dropIfStage(
            'nextjs-noise-filter',
            (span) => enabled && isNoisyNextSpan(span),
        ),
        enrich: {
            name: 'nextjs-enrich',
            onEnd: (span) => {
                if (enabled) enrichNextSpan(span);
                return 'keep';
            },
        },
    };
}
