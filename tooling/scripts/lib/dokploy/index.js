import createClient from 'openapi-fetch';

function getClient() {
    const { DOKPLOY_URL, DOKPLOY_API_KEY, DOKPLOY_COOKIE } = process.env;
    if (!DOKPLOY_URL) throw new Error('Missing required env var: DOKPLOY_URL');
    if (!DOKPLOY_API_KEY && !DOKPLOY_COOKIE)
        throw new Error(
            'Missing required env vars: DOKPLOY_URL, DOKPLOY_API_KEY',
        );
    const headers = DOKPLOY_API_KEY
        ? { 'x-api-key': DOKPLOY_API_KEY }
        : { Cookie: DOKPLOY_COOKIE };
    return createClient({ baseUrl: `${DOKPLOY_URL}/api`, headers });
}

/**
 * @param {string} group
 * @param {string} name
 * @returns {(opts?: { query?: unknown, body?: unknown }) => Promise<any>}
 */
function makeMethod(group, name) {
    const path = `/${group}.${name.charAt(0).toLowerCase()}${name.slice(1)}`;
    return async ({ query, body } = {}) => {
        /** @type {Record<string, unknown>} */
        const opts = {};
        if (query !== undefined) opts.params = { query };
        if (body !== undefined) opts.body = body;
        // shortcut: path is built at runtime, so openapi-fetch's literal-path
        // typing can't apply; the public types come from DpClient.
        const res = await /** @type {any} */ (getClient())[
            body !== undefined ? 'POST' : 'GET'
        ](path, opts);
        if (res.error)
            throw new Error(`${path} failed: ${JSON.stringify(res.error)}`);
        return res.data;
    };
}

export const dokploy = /** @type {import('./client').DpClient} */ (
    new Proxy(
        {},
        {
            get(_, group) {
                return new Proxy(
                    {},
                    {
                        get(_, name) {
                            return makeMethod(String(group), String(name));
                        },
                    },
                );
            },
        },
    )
);
