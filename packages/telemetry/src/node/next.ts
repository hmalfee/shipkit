import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

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

export function isNoisyNextSpan(span: ReadableSpan): boolean {
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

export function enrichNextSpan(span: ReadableSpan): void {
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
                // Span names are read-only in the OTel API types, but the SDK's
                // ReadableSpan is a plain mutable object at runtime.
                (span as unknown as { name: string }).name =
                    `RSC ${method} ${route}`;
            }
        }
    } else {
        attrs['operation.name'] = `next_js.${spanType}`;
    }
}

export function shouldIgnoreNextIncomingRequest(url: string): boolean {
    return NEXT_IGNORED_PATHS.some((p) => url.includes(p));
}

/**
 * True when a span's outbound URL matches one of the configured `ignoredUrls` substrings.
 * Extracted so FilteringSpanProcessor.onEnd reads as a checklist instead of a boolean expression.
 */
export function matchesIgnoredUrl(
    span: ReadableSpan,
    ignoredUrls: string[],
): boolean {
    if (!ignoredUrls.length) return false;
    const url = span.attributes['http.url'] ?? span.attributes['url.full'];
    return typeof url === 'string' && ignoredUrls.some((u) => url.includes(u));
}

/**
 * True when a span's target path or route matches one of the configured `ignoredRoutes` prefixes.
 * Extracted so FilteringSpanProcessor.onEnd reads as a checklist instead of a boolean expression.
 */
export function matchesIgnoredRoute(
    span: ReadableSpan,
    ignoredRoutes: string[],
): boolean {
    if (!ignoredRoutes.length) return false;
    const target =
        span.attributes['http.target'] ?? span.attributes['url.path'];
    const route = span.attributes['http.route'];
    return ignoredRoutes.some(
        (r) =>
            (typeof target === 'string' && target.startsWith(r)) ||
            (typeof route === 'string' && route.startsWith(r)),
    );
}
