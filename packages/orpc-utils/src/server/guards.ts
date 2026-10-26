import type { CommonORPCErrorCode } from '@orpc/client';

export type ErrorFactory = (options?: { message?: string }) => Error;

type Falsy = false | 0 | 0n | '' | null | undefined;

/** Keys of `C` whose type admits any falsy value. Guarding any other key does nothing useful. */
type FalsyableKeys<C> = {
    [P in keyof C]-?: null extends C[P]
        ? P
        : undefined extends C[P]
          ? P
          : C[P] extends Falsy
            ? P
            : never;
}[keyof C];

/**
 * `C` with `K` made required and non-nullable (truthy path).
 * `-?` matters: without it `session?: S` stays `S | undefined` after narrowing.
 */
type NarrowedContext<C, K extends PropertyKey> = Omit<C, K> & {
    [P in K & keyof C]-?: NonNullable<C[P]>;
};

/**
 * `C` with `K` narrowed to its falsy members only (negate path).
 * e.g. `session: StrictSession | null` becomes `session: null`.
 */
type NegatedContext<C, K extends PropertyKey> = Omit<C, K> & {
    [P in K & keyof C]-?: Extract<C[P], Falsy>;
};

/** `O` with its `context` replaced by the narrowed one. */
type Narrowed<O extends { context: object }, K extends PropertyKey> = Omit<
    O,
    'context'
> & {
    context: NarrowedContext<O['context'], K>;
};

/** `O` with its `context` replaced by the negated one. */
type Negated<O extends { context: object }, K extends PropertyKey> = Omit<
    O,
    'context'
> & {
    context: NegatedContext<O['context'], K>;
};

/**
 * Builds a guard that checks `context[key]`:
 *
 * - Without `negate` (default): throws when the value is falsy (null, undefined, false, 0, '', 0n), narrows `key`
 *   to `NonNullable` inside the handler. Pass `check` for an extra condition
 *   on the narrowed context (e.g. role check). `check` runs only after the
 *   falsy check passes.
 *
 * - With `negate: true`: throws when the value is truthy. The handler receives
 *   the context unchanged — no narrowing; `check` is not available.
 *
 * Two outer calls because TypeScript can't partially infer type arguments:
 * the first fixes the context type, the second infers `key` and `error`.
 *
 * @example
 * export const authed = createContextGuard<HandlerContext>()({
 *     key: 'session',
 *     error: 'UNAUTHORIZED',
 *     message: 'You must be logged in',
 * });
 *
 * export const requireAdmin = createContextGuard<HandlerContext>()({
 *     key: 'session',
 *     check: ({ session }) => session.user.roles.includes('admin'),
 *     error: 'FORBIDDEN',
 *     message: 'Admin access required',
 * });
 *
 * export const guest = createContextGuard<HandlerContext>()({
 *     key: 'session',
 *     error: 'FORBIDDEN',
 *     message: 'You must be logged out',
 *     negate: true,
 * });
 */
export function createContextGuard<TContext extends object>(): {
    // negate: true — handler gets Negated<O, K> (falsy-only narrowing)
    <
        K extends FalsyableKeys<TContext> & string,
        E extends CommonORPCErrorCode,
    >(config: {
        key: K;
        error: E;
        message?: string;
        negate: true;
    }): <O extends { context: TContext; errors: Record<E, ErrorFactory> }, R>(
        fn: (o: Negated<O, K>) => R | Promise<R>,
    ) => (o: O) => Promise<R>;
    // negate absent/false — handler gets Narrowed<O, K>
    <
        K extends FalsyableKeys<TContext> & string,
        E extends CommonORPCErrorCode,
    >(config: {
        key: K;
        check?: (context: NarrowedContext<TContext, K>) => boolean;
        error: E;
        message?: string;
        negate?: false;
    }): <O extends { context: TContext; errors: Record<E, ErrorFactory> }, R>(
        fn: (o: Narrowed<O, K>) => R | Promise<R>,
    ) => (o: O) => Promise<R>;
} {
    return (<
        K extends FalsyableKeys<TContext> & string,
        E extends CommonORPCErrorCode,
    >(config: {
        key: K;
        check?: (context: NarrowedContext<TContext, K>) => boolean;
        error: E;
        message?: string;
        negate?: boolean;
    }) => {
        const { key, error, message } = config;
        const negate = config.negate ?? false;
        const check = negate ? undefined : config.check;

        return <
                O extends {
                    context: TContext;
                    errors: Record<E, ErrorFactory>;
                },
                R,
            >(
                fn: (o: Narrowed<O, K> | Negated<O, K>) => R | Promise<R>,
            ) =>
            async (o: O): Promise<R> => {
                // Reflect.get avoids a cast just to index a generic context.
                const value = Boolean(Reflect.get(o.context, key));
                const passes = negate
                    ? !value
                    : value &&
                      // Cast is type-level only: the falsy check just passed.
                      (check?.(
                          o.context as unknown as NarrowedContext<TContext, K>,
                      ) ??
                          true);
                if (!passes) {
                    throw o.errors[error](
                        message === undefined ? undefined : { message },
                    );
                }
                // Cast is type-level only: narrowing confirmed by the guard above.
                return fn(o as unknown as Narrowed<O, K> & Negated<O, K>);
            };
    }) as ReturnType<typeof createContextGuard<TContext>>;
}
