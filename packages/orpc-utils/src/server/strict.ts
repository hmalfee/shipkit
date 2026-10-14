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

type StrictHandler<B> = <R extends PadVariants<HandlerOutput<B>>>(
    fn: (
        opts: HandlerOpts<B>,
    ) => Promise<R & Exact<NoInfer<R>, PadVariants<HandlerOutput<B>>>>,
) => HandlerReturn<B>;

/** Replaces `.handler` on every procedure in a builder tree. */
type Strictify<T> = T extends AnyFn
    ? T
    : T extends { handler: AnyFn }
      ? Omit<T, 'handler'> & { handler: StrictHandler<T> }
      : {
            [K in keyof T]: K extends '~orpc' ? T[K] : Strictify<T[K]>;
        };

/**
 * Finalizes a route builder. Every `.handler()` on the result checks its
 * return value exactly against the contract. Type-only: returns the same
 * object at runtime.
 */
export function defineRouteBuilder<T extends object>(builder: T): Strictify<T> {
    return builder as unknown as Strictify<T>;
}
