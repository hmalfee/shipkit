import type { NextConfig } from 'next';

type RewritesFn = NonNullable<NextConfig['rewrites']>;
type RewritesResult = Awaited<ReturnType<RewritesFn>>;
type Rewrite = Extract<RewritesResult, unknown[]>[number];
type RewritesObject = Exclude<RewritesResult, unknown[]>;

interface WithRewriteProxyOptions {
    path: string;
    region?: 'us' | 'eu';
}

export function withRewriteProxy(
    nextConfig: NextConfig,
    { path, region = 'us' }: WithRewriteProxyOptions,
): NextConfig {
    // Order matters: static/array must precede the catch-all (per PostHog's docs)
    const postHogRewrites: Rewrite[] = [
        {
            source: `${path}/static/:path*`,
            destination: `https://${region}-assets.i.posthog.com/static/:path*`,
        },
        {
            source: `${path}/array/:path*`,
            destination: `https://${region}-assets.i.posthog.com/array/:path*`,
        },
        {
            source: `${path}/:path*`,
            destination: `https://${region}.i.posthog.com/:path*`,
        },
    ];

    const cleanPath = path.replace(/^\//, '');

    return {
        ...nextConfig,
        skipTrailingSlashRedirect: true,
        async redirects() {
            const existing = (await nextConfig.redirects?.()) ?? [];
            return [
                ...existing,
                {
                    // Next.js normally removes trailing slashes automatically (e.g. /about/ → /about),
                    // but we disable that globally above because PostHog's API endpoints *require*
                    // trailing slashes (e.g. /your-proxy-path/e/ must stay as-is).
                    //
                    // So instead we manually redirect trailing slashes here
                    // for everything except the PostHog proxy path.
                    source: `/:path((?!${cleanPath}(?:/|$)).*)/`,
                    destination: '/:path',
                    permanent: true,
                },
            ];
        },
        async rewrites(): Promise<RewritesObject> {
            const existing = (await nextConfig.rewrites?.()) ?? [];
            // A plain array's semantics are equivalent to `afterFiles`, so
            // normalizing into that bucket preserves existing behavior
            // and matches PostHog's own recommended placement.
            const normalized: RewritesObject = Array.isArray(existing)
                ? { afterFiles: existing }
                : existing;
            return {
                ...normalized,
                afterFiles: [
                    ...(normalized.afterFiles ?? []),
                    ...postHogRewrites,
                ],
            };
        },
    };
}
