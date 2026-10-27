import type { AnyContractRouter } from '@orpc/contract';
import type { GuardedOpts, GuardMeta } from './guards';

type AnyFn = (...args: never[]) => unknown;

type Opaque =
    | string
    | number
    | boolean
    | bigint
    | symbol
    | null
    | undefined
    | Date
    | RegExp
    | Uint8Array
    | AnyFn;

type KeysOf<T> = T extends unknown ? keyof T : never;

type PropOf<T, K extends PropertyKey> = T extends unknown
    ? K extends keyof T
        ? T[K]
        : never
    : never;

type ObjectMembers<S> = Exclude<S, Opaque | readonly unknown[]>;
type ElementOf<S> = Extract<S, readonly unknown[]>[number];

/**
 * Gives each union member `?: undefined` for keys only its siblings declare.
 * `{ status: 200 }` in a union with `{ status: 302; headers }` becomes
 * `{ status: 200; headers?: undefined }`, so `headers` on a 200 is rejected.
 */
type PadVariants<T, All extends PropertyKey = KeysOf<T>> = T extends unknown
    ? T & Partial<Record<Exclude<All, keyof T>, undefined>>
    : never;

/**
 * `T` with every property that `S` does not declare typed as `never`.
 * Recurses through objects and arrays. Opaque values pass through.
 */
type Exact<T, S> = unknown extends S
    ? T
    : T extends Opaque
      ? T
      : T extends readonly unknown[]
        ? { [I in keyof T]: Exact<T[I], ElementOf<S>> }
        : T extends object
          ? {
                [K in keyof T]: K extends KeysOf<ObjectMembers<S>>
                    ? Exact<T[K], PropOf<ObjectMembers<S>, K>>
                    : never;
            }
          : T;

// Pulled from the builder's own `.handler` type, so nothing is re-derived
// from the contract here.
type HandlerFn<B> = B extends { handler: (fn: infer F) => unknown } ? F : never;
type HandlerOpts<B> =
    HandlerFn<B> extends (opts: infer O) => unknown ? O : never;
type HandlerOutput<B> =
    HandlerFn<B> extends (opts: never) => infer R ? Awaited<R> : never;
type HandlerReturn<B> = B extends { handler: (fn: never) => infer Ret }
    ? Ret
    : never;

// ─── Handler tree ────────────────────────────────────────────────────────────

/** Keys leading to child nodes. Skips builder methods (`use`, `router`...) and `~orpc`. */
type ChildKeys<B> = {
    [K in keyof B]: K extends '~orpc' ? never : B[K] extends AnyFn ? never : K;
}[keyof B];

type ChildOf<B, K> = K extends keyof B ? B[K] : never;

/** Plain-function version of every procedure under a builder node. `G` narrows the options. */
type HandlerTree<B, G = undefined> = B extends { handler: AnyFn }
    ? (
          opts: GuardedOpts<HandlerOpts<B>, G>,
      ) => Promise<PadVariants<HandlerOutput<B>>>
    : { [K in ChildKeys<B>]: HandlerTree<B[K], G> };

/** Exact-return check applied across the tree. Unknown keys become `never`. */
type ExactTree<H, B> = B extends { handler: AnyFn }
    ? H extends (...a: infer A) => Promise<infer R>
        ? (...a: A) => Promise<R & Exact<R, PadVariants<HandlerOutput<B>>>>
        : never
    : {
          [K in keyof H]: K extends ChildKeys<B>
              ? ExactTree<H[K], B[K & keyof B]>
              : never;
      };

/** The router (or procedure) that a handler tree becomes once bound. */
type BoundRouter<B> = B extends { handler: AnyFn }
    ? HandlerReturn<B>
    : { [K in ChildKeys<B>]: BoundRouter<B[K]> };

type ExactCheck<T, B> = [T] extends [ExactTree<T, B>]
    ? []
    : [error: 'Handler return has keys the contract does not declare'];

/** Dotted paths of procedures under `B` whose contract doesn't declare error `E`. */
type MissingPaths<B, E extends string, P extends string> = B extends {
    handler: AnyFn;
}
    ? HandlerOpts<B> extends { errors: infer Er }
        ? E extends keyof Er
            ? never
            : P
        : P
    : {
          [K in ChildKeys<B> & string]: MissingPaths<
              ChildOf<B, K>,
              E,
              `${P}.${K}`
          >;
      }[ChildKeys<B> & string];

/** A guarded group is only valid if every route declares the error the guard throws. */
type GuardCheck<B, G, P extends string> = G extends {
    meta: { error: infer E extends string };
}
    ? [MissingPaths<B, E, P>] extends [never]
        ? []
        : [
              error: `Guard throws ${E}, but the contract doesn't declare it for: ${MissingPaths<B, E, P>}`,
          ]
    : [];

type DefineChecks<T, B, G, P extends string> =
    ExactCheck<T, B> extends [] ? GuardCheck<B, G, P> : ExactCheck<T, B>;

// Type-only. Lets `createGuardedRouter` recover `B` from a definer, since `B`
// can't be inferred from the mapped type itself. Never exists at runtime.
declare const builderType: unique symbol;

/** One definer per top-level contract group: `defineRouter.auth({ ... })`. */
type DefineRouter<B, G = undefined> = {
    [K in ChildKeys<B>]: <T extends HandlerTree<ChildOf<B, K>, G>>(
        // ExactTree is deliberately not intersected into the handlers parameter.
        // An intersection or conditional there stops TypeScript inferring a wrapper's
        // generics from the handler position, and someone will try to "simplify" it back otherwise.
        handlers: T,
        ...check: DefineChecks<T, ChildOf<B, K>, G, K & string>
    ) => BoundRouter<ChildOf<B, K>>;
} & { readonly [builderType]?: B };

/** Handler options of every procedure under a builder node, as a union. */
type OptsOf<B> = B extends { handler: AnyFn }
    ? HandlerOpts<B>
    : { [K in ChildKeys<B>]: OptsOf<B[K]> }[ChildKeys<B>];

/**
 * The context a handler receives once every `.use(...)` on `B` has run.
 * Middleware is global here, so every procedure yields the same context
 * and the union collapses to one type.
 */
export type ContextFromProcedures<B> =
    OptsOf<B> extends infer O
        ? O extends { context: infer C }
            ? C
            : never
        : never;

// ─── Runtime ─────────────────────────────────────────────────────────────────

type BuilderNode = Record<string, unknown>;
type UntypedHandlers = AnyFn | { [key: string]: UntypedHandlers };

const isProcedure = (n: unknown): n is { handler: (fn: unknown) => unknown } =>
    typeof (n as BuilderNode | null | undefined)?.handler === 'function';

/** Walks the handler object and binds each function to the builder procedure at the same path. */
function bindHandlers(
    node: unknown,
    handlers: UntypedHandlers,
    path: string[],
): unknown {
    const at = path.join('.');
    if (node == null) {
        throw new Error(`[orpc-utils] "${at}" is not in the contract`);
    }
    if (typeof handlers === 'function') {
        if (!isProcedure(node)) {
            throw new Error(
                `[orpc-utils] "${at}" is a router, expected an object`,
            );
        }
        return node.handler(handlers); // method call keeps `this`
    }
    if (isProcedure(node)) {
        throw new Error(
            `[orpc-utils] "${at}" is a procedure, expected a function`,
        );
    }
    return Object.fromEntries(
        Object.entries(handlers).map(([k, h]) => [
            k,
            bindHandlers((node as BuilderNode)[k], h, [...path, k]),
        ]),
    );
}

/**
 * Creates `defineRouter`, with one entry per top-level contract group.
 * `defineRouter.auth({ ... })` takes a handler object that mirrors the
 * `auth` group of the contract. Position decides which procedure each
 * handler implements. Type checks reject unknown keys, missing keys, and
 * return values the contract doesn't declare. `bindHandlers` re-checks the
 * shape at startup.
 *
 * `contract` supplies the runtime keys, because oRPC's implementer resolves
 * its keys lazily and can't be enumerated. `builder` supplies the types and
 * the middleware chain.
 */
export function createDefineRouter<B extends object>(
    contract: AnyContractRouter,
    builder: B,
): DefineRouter<B> {
    return Object.fromEntries(
        Object.keys(contract).map((group) => [
            group,
            (handlers: UntypedHandlers) =>
                bindHandlers((builder as BuilderNode)[group], handlers, [
                    group,
                ]),
        ]),
    ) as unknown as DefineRouter<B>;
}

/** Wraps every handler function in the tree with the guard, keeping the tree's shape. */
function wrapHandlers(
    handlers: UntypedHandlers,
    wrap: (fn: AnyFn) => AnyFn,
): UntypedHandlers {
    if (typeof handlers === 'function') return wrap(handlers);
    return Object.fromEntries(
        Object.entries(handlers).map(([k, h]) => [k, wrapHandlers(h, wrap)]),
    );
}

/**
 * Applies a guard (from `createContextGuard`) to every handler of an existing
 * definer. Handlers receive the narrowed context, and every procedure's
 * contract must declare the guard's error code, or the call fails to compile.
 *
 * @example
 * export const defineAuthedRouter = createGuardedRouter(defineRouter, authed);
 */
export function createGuardedRouter<
    B extends object,
    G extends { meta: GuardMeta },
>(base: DefineRouter<B>, guard: G): DefineRouter<B, G> {
    const wrap = guard as unknown as (fn: AnyFn) => AnyFn;
    return Object.fromEntries(
        Object.entries(base).map(([group, define]) => [
            group,
            (handlers: UntypedHandlers) =>
                (define as (h: UntypedHandlers) => unknown)(
                    wrapHandlers(handlers, wrap),
                ),
        ]),
    ) as unknown as DefineRouter<B, G>;
}
