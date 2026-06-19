import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

/**
 * Parse Sentry DSN to extract components
 * DSN format: https://key@instance/project
 */
function parseSentryDSN(dsn: string) {
    const dsnUrl = new URL(dsn);
    return {
        securityKey: dsnUrl.username,
        instanceUrl: `${dsnUrl.protocol}//${dsnUrl.host}`,
        projectId: dsnUrl.pathname.replace(/^\//, ''),
    };
}

/**
 * Creates a Sentry Tunnel API Route handler.
 * This endpoint forwards client-side errors to Sentry, bypassing ad blockers and third-party tools.
 *
 * @example
 * ```ts
 * // app/api/ingest-st/route.ts
 * import { createSentryTunnelHandler } from '@mento-mark/sentry/next';
 *
 * const handler = createSentryTunnelHandler(process.env.NEXT_PUBLIC_SENTRY_DSN);
 * export { handler as GET, handler as POST };
 * ```
 */
export function createSentryTunnelHandler(dsn: string | undefined) {
    // Return the async function directly
    return async (req: NextRequest) => {
        if (!dsn) {
            return new NextResponse(null, { status: 404 });
        }

        const { securityKey, instanceUrl, projectId } = parseSentryDSN(dsn);
        const url = `${instanceUrl}/api/${projectId}/envelope/?sentry_key=${securityKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=UTF-8',
                    Accept: '*/*',
                },
                body: req.body,
                duplex: 'half',
            } as RequestInit & { duplex: 'half' });

            if (!response.ok) {
                return new NextResponse(null, { status: response.status });
            }

            return new NextResponse(null, { status: 200 });
        } catch (error) {
            // oxlint-disable-next-line no-console
            console.error('Tunnel error:', error);
            return new NextResponse(null, { status: 500 });
        }
    };
}
