import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

const NOISY_NEXT_SPAN_TYPES = new Set([
    'NextNodeServer.getLayoutOrPageModule',
    'NextNodeServer.createComponentTree',
    'NextNodeServer.findPageComponents',
    'NextNodeServer.startResponse',
    'NextNodeServer.clientComponentLoading',
]);

export const nextjsSpanFilters: Array<(span: ReadableSpan) => boolean> = [
    (span) => {
        const spanType = span.attributes['next.span_type'];
        return (
            typeof spanType === 'string' && NOISY_NEXT_SPAN_TYPES.has(spanType)
        );
    },
    (span) => {
        const url = span.attributes['http.url'] ?? span.attributes['url.full'];
        return typeof url === 'string' && url.includes('registry.npmjs.org');
    },
];

export function nextjsRouteExtractor(span: ReadableSpan): string | undefined {
    const route = span.attributes['next.route'];
    return typeof route === 'string' ? route : undefined;
}
