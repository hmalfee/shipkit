import { trace } from '@opentelemetry/api';

/**
 * Next.js-specific URL patterns to ignore in browser instrumentation.
 * Prevents tracing internal Next.js requests (chunks, HMR, data routes).
 */
export const nextjsBrowserIgnoredUrls: (string | RegExp)[] = [
    /\/__nextjs_/,
    /\/_next\//,
    /\.hot-update\./,
];

const tracer = trace.getTracer('@mento-mark/telemetry/browser/next');

/**
 * Creates a span for Next.js client-side route transitions.
 * Signature matches Next.js `onRouterTransitionStart(url, { navigationType })`.
 */
export function createNavigationSpan(
    url: string,
    {
        navigationType,
    }: {
        navigationType: 'push' | 'replace' | 'traverse';
    },
) {
    const span = tracer.startSpan('navigation', {
        attributes: {
            'url.path': url,
            'navigation.type': navigationType,
        },
    });
    span.end();
}
