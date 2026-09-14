const SERVER_TIMING_HEADER = 'x-server-time';

interface ServerTimingSample {
    /** Server wall-clock time (epoch ms) when it started handling the request. */
    serverStart: number;
    /** Server wall-clock time (epoch ms) when it finished handling the request. */
    serverEnd: number;
}

/**
 * Sets `x-server-time` on a response and exposes it via CORS, in one call.
 * Works with any Fetch-API-standard `Headers` object (Hono, Next.js route
 * handlers, Bun, Cloudflare Workers, ...).
 */
export function applyServerTimingHeader(
    headers: Headers,
    sample: ServerTimingSample,
): void {
    headers.set(
        SERVER_TIMING_HEADER,
        `${sample.serverStart},${sample.serverEnd}`,
    );
    headers.append('Access-Control-Expose-Headers', SERVER_TIMING_HEADER);
}

/**
 * Parses the `x-server-time` header from a Headers object. Returns `null`
 * for missing/malformed input. Mainly used in browser-side telemetry
 * for clock skew correction.
 */
export function parseServerTimeHeader(
    headers: Headers,
): ServerTimingSample | null {
    const value = headers.get(SERVER_TIMING_HEADER);
    if (!value) return null;
    const parts = value.split(',');
    if (parts.length !== 2) return null;
    const serverStart = Number(parts[0]);
    const serverEnd = Number(parts[1]);
    if (!Number.isFinite(serverStart) || !Number.isFinite(serverEnd))
        return null;
    return { serverStart, serverEnd };
}
