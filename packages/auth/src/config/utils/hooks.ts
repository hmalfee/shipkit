import type { BetterAuthOptions, GenericEndpointContext } from 'better-auth';

// ─── hooks ────────────────────────────────────────────────────────────────────

type Hooks = NonNullable<BetterAuthOptions['hooks']>;
type AuthMiddlewareFn = NonNullable<Hooks['before']>;

type HooksInput = {
    /** Path-keyed before-hook map. '/*' fires for any path not explicitly listed. */
    before?: Record<string, AuthMiddlewareFn>;
    /** Path-keyed after-hook map. '/*' fires for any path not explicitly listed. */
    after?: Record<string, AuthMiddlewareFn>;
};

function makePathRouter(
    map: Record<string, AuthMiddlewareFn>,
): AuthMiddlewareFn {
    const dispatch = async (ctx: GenericEndpointContext) => {
        const handler = map[ctx.path] ?? map['/*'];
        return handler?.(ctx);
    };
    return dispatch as AuthMiddlewareFn;
}

/**
 * Accepts the hooks config with path-keyed maps at before/after,
 * and produces the full hooks object better-auth expects.
 *
 * Routing: exact path match wins; '/*' is the fallback for unregistered paths.
 */
export function composePathBasedHooks(input: HooksInput): Hooks {
    const result: Hooks = {};
    if (input.before) result.before = makePathRouter(input.before);
    if (input.after) result.after = makePathRouter(input.after);
    return result;
}

// ─── databaseHooks ────────────────────────────────────────────────────────────

type DBHooks = NonNullable<BetterAuthOptions['databaseHooks']>;

/**
 * Extracts the exact function type for a databaseHooks leaf.
 * Unlike regular hooks (where `createAuthMiddleware` infers the context),
 * db hooks are plain functions — hand-writing params is error-prone and
 * hides what fields are actually available. This derives the signature
 * directly from BetterAuthOptions.
 *
 * @example
 * const myHook: DbHookFn<'user', 'update', 'before'> = async (data, ctx) => { ... };
 */
export type DbHookFn<
    Entity extends keyof DBHooks,
    Op extends keyof NonNullable<DBHooks[Entity]>,
    Phase extends keyof NonNullable<NonNullable<DBHooks[Entity]>[Op]>,
> = NonNullable<NonNullable<NonNullable<DBHooks[Entity]>[Op]>[Phase]>;

type PathMap<Op> = {
    [K in keyof Op]?: Record<string, NonNullable<Op[K]>>;
};

type EntityInput<E> = {
    [Op in keyof E]?: PathMap<NonNullable<E[Op]>>;
};

type DBHooksInput = {
    [Entity in keyof DBHooks]?: EntityInput<NonNullable<DBHooks[Entity]>>;
};

function makeDbPathRouter<
    F extends (data: unknown, ctx: GenericEndpointContext | null) => unknown,
>(map: Record<string, F>): F {
    return (async (data: unknown, hookCtx: GenericEndpointContext | null) => {
        const path = hookCtx?.path;
        const handler = (path ? map[path] : undefined) ?? map['/*'];
        return handler?.(data, hookCtx);
    }) as F;
}

/**
 * Accepts the databaseHooks config with path-keyed maps at before/after leaves,
 * and produces the databaseHooks object better-auth expects.
 *
 * Routing: exact hookCtx.path match wins; '/*' is the fallback for unregistered paths.
 */
export function composePathBasedDbHooks(input: DBHooksInput): DBHooks {
    const result: DBHooks = {};
    for (const entityKey of Object.keys(input) as (keyof DBHooks)[]) {
        const entityInput = input[entityKey];
        if (!entityInput) continue;
        const entityResult: Record<string, Record<string, unknown>> = {};
        for (const opKey of Object.keys(entityInput)) {
            const opInput = (
                entityInput as Record<
                    string,
                    Record<string, Record<string, unknown>>
                >
            )[opKey];
            if (!opInput) continue;
            const opResult: Record<string, unknown> = {};
            for (const phase of ['before', 'after'] as const) {
                const map = opInput[phase];
                if (map)
                    opResult[phase] = makeDbPathRouter(
                        map as Record<
                            string,
                            (
                                data: unknown,
                                ctx: GenericEndpointContext | null,
                            ) => unknown
                        >,
                    );
            }
            entityResult[opKey] = opResult;
        }
        result[entityKey] = entityResult as never;
    }
    return result;
}
