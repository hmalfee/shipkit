import * as sdk from '@dokploy/sdk';

/**
 * @typedef {{
 *  [K in keyof typeof sdk as (typeof sdk)[K] extends (...args: any[]) => any ? K : never]:
 *    (typeof sdk)[K] extends (...args: infer A) => Promise<{ data: infer D }> | { data: infer D }
 *      ? (...args: A) => Promise<D>
 *      : (typeof sdk)[K];
 * }} DokployProxy
 */

/** @type {DokployProxy} */
export const dp = new Proxy(
    {},
    {
        get(_, name) {
            const fn = sdk[name];
            if (typeof fn !== 'function')
                throw new TypeError(`dp.${name} is not a function`);
            return async (...args) => {
                const res = await fn(...args);
                if (res.error)
                    throw new Error(
                        `${name} failed: ${JSON.stringify(res.error)}`,
                    );
                return res.data;
            };
        },
    },
);
