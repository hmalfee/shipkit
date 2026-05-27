import { oc } from '@orpc/contract';
import z from 'zod';

import type {
    AnySchema,
    ContractProcedureBuilder,
    ContractProcedureBuilderWithInput,
    ContractProcedureBuilderWithInputOutput,
    ContractProcedureBuilderWithOutput,
    ErrorMap,
    MergedErrorMap,
    Meta,
    Schema,
} from '@orpc/contract';

// ─── Base Builder ────────────────────────────────────────────────────────────

/** Root oRPC contract builder with shared defaults applied to all routes. */
const base = oc
    .$route({ inputStructure: 'detailed', outputStructure: 'detailed' })
    .errors({ INTERNAL_SERVER_ERROR: {} });

// ─── Error Maps ──────────────────────────────────────────────────────────────

/** Automatically added to any route that defines `.input(...)`. */
const badRequestError = {
    BAD_REQUEST: {
        data: z.object({
            formErrors: z.array(z.string()).optional(),
            fieldErrors: z
                .record(z.string(), z.array(z.string()).optional())
                .optional(),
        }),
    },
} as const;

/**
 * Restricts user-defined error maps from overriding reserved error codes
 * (`BAD_REQUEST` and `INTERNAL_SERVER_ERROR`) which are managed automatically.
 */
type RestrictedErrorMap = Omit<
    ErrorMap,
    'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR'
>;

// ─── Response Codes ───────────────────────────────────────────────────────────

const RESPONSE_STATUS = {
    // 2xx
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    // 3xx
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,
} as const;

type ResponseCode = keyof typeof RESPONSE_STATUS;

/** Maps response codes to their response body schemas (body is optional per code). */
type ResponseMap = Partial<Record<ResponseCode, z.ZodTypeAny>>;

// ─── Input Shape ─────────────────────────────────────────────────────────────

/** Defines the valid structure for a route's input (body/query/params/headers). */
type ValidInputShape = {
    body?: z.ZodObject<z.ZodRawShape>;
    query?: z.ZodObject<z.ZodRawShape>;
    params?: z.ZodObject<z.ZodRawShape>;
    headers?: z.ZodObject<z.ZodRawShape>;
};

// ─── Output Schema Derivation ─────────────────────────────────────────────────

/** Response codes that represent HTTP redirects (3xx). */
type RedirectCode =
    | 'MOVED_PERMANENTLY'
    | 'FOUND'
    | 'TEMPORARY_REDIRECT'
    | 'PERMANENT_REDIRECT';

/**
 * Wraps a single response entry into the appropriate shape:
 *  - Body schema provided → `{ status, body }`
 *  - No body, redirect code → `{ status, headers: { location } }`
 *  - No body, non-redirect  → `{ status }`
 */
type SingleResponseSchema<C extends ResponseCode, S> = S extends z.ZodTypeAny
    ? z.ZodObject<{
          status: z.ZodLiteral<(typeof RESPONSE_STATUS)[C]>;
          body: S;
      }>
    : C extends RedirectCode
      ? z.ZodObject<{
            status: z.ZodLiteral<(typeof RESPONSE_STATUS)[C]>;
            headers: z.ZodObject<{ location: z.ZodString }>;
        }>
      : z.ZodObject<{ status: z.ZodLiteral<(typeof RESPONSE_STATUS)[C]> }>;

/** Derives a union of wrapped response schemas from a `ResponseMap`. */
type ConvertResponseMapToOutputSchema<M extends ResponseMap> = {
    [K in keyof M & ResponseCode]: SingleResponseSchema<K, M[K]>;
}[keyof M & ResponseCode];

// ─── Builder Type Overrides ───────────────────────────────────────────────────
//
// These mirror the oRPC builder types but restrict `.input()`, `.output()`, and
// `.errors()` to our custom shapes, keeping the public API tightly controlled.

type MyContractBuilderWithInputOutput<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
> = Omit<
    ContractProcedureBuilderWithInputOutput<
        TInputSchema,
        TOutputSchema,
        TErrorMap,
        TMeta
    >,
    'errors'
> & {
    errors<U extends RestrictedErrorMap>(
        errors: U,
    ): MyContractBuilderWithInputOutput<
        TInputSchema,
        TOutputSchema,
        MergedErrorMap<TErrorMap, U>,
        TMeta
    >;
};

type MyContractBuilderWithOutput<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
> = Omit<
    ContractProcedureBuilderWithOutput<
        TInputSchema,
        TOutputSchema,
        TErrorMap,
        TMeta
    >,
    'input' | 'errors'
> & {
    input<U extends ValidInputShape>(
        shape: U,
    ): MyContractBuilderWithInputOutput<
        z.ZodObject<U>,
        TOutputSchema,
        MergedErrorMap<TErrorMap, typeof badRequestError>,
        TMeta
    >;
    errors<U extends RestrictedErrorMap>(
        errors: U,
    ): MyContractBuilderWithOutput<
        TInputSchema,
        TOutputSchema,
        MergedErrorMap<TErrorMap, U>,
        TMeta
    >;
};

type MyContractBuilderWithInput<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
> = Omit<
    ContractProcedureBuilderWithInput<
        TInputSchema,
        TOutputSchema,
        TErrorMap,
        TMeta
    >,
    'errors' | 'output'
> & {
    errors<U extends RestrictedErrorMap>(
        errors: U,
    ): MyContractBuilderWithInput<
        TInputSchema,
        TOutputSchema,
        MergedErrorMap<TErrorMap, U>,
        TMeta
    >;
    responses<U extends ResponseMap>(
        responses: U,
    ): MyContractBuilderWithInputOutput<
        TInputSchema,
        ConvertResponseMapToOutputSchema<U>,
        TErrorMap,
        TMeta
    >;
};

type MyContractBuilder<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
> = Omit<
    ContractProcedureBuilder<TInputSchema, TOutputSchema, TErrorMap, TMeta>,
    'input' | 'errors' | 'output'
> & {
    input<U extends ValidInputShape>(
        shape: U,
    ): MyContractBuilderWithInput<
        z.ZodObject<U>,
        TOutputSchema,
        MergedErrorMap<TErrorMap, typeof badRequestError>,
        TMeta
    >;
    errors<U extends RestrictedErrorMap>(
        errors: U,
    ): MyContractBuilder<
        TInputSchema,
        TOutputSchema,
        MergedErrorMap<TErrorMap, U>,
        TMeta
    >;
    responses<U extends ResponseMap>(
        responses: U,
    ): MyContractBuilderWithOutput<
        TInputSchema,
        ConvertResponseMapToOutputSchema<U>,
        TErrorMap,
        TMeta
    >;
};

/** Shared initial error map type for all `rb` route entries. */
type BaseErrorMap = MergedErrorMap<
    Record<never, never>,
    { INTERNAL_SERVER_ERROR: Record<string, never> }
>;

// ─── Internal Builder Interfaces ─────────────────────────────────────────────
//
// Narrow structural types used to safely access oRPC builder methods inside the
// proxy handlers, avoiding `any` casts on `target: object`.

type BuilderWithInputMethod = {
    input: (
        schema: AnySchema,
    ) => ContractProcedureBuilderWithInput<
        AnySchema,
        AnySchema,
        ErrorMap,
        Meta
    >;
};
type BuilderWithOutputMethod = {
    output: (
        schema: AnySchema,
    ) => ContractProcedureBuilderWithInputOutput<
        AnySchema,
        AnySchema,
        ErrorMap,
        Meta
    >;
};
type BuilderWithErrorsMethod = {
    errors: (
        errs: Record<string, unknown>,
    ) => ContractProcedureBuilderWithInput<
        AnySchema,
        AnySchema,
        ErrorMap,
        Meta
    >;
};
type BuilderWithRouteMethod = {
    $route: (config: Record<string, unknown>) => object;
};

// ─── Proxy Handlers ───────────────────────────────────────────────────────────

/**
 * Intercepts `.input(shape)` calls to:
 *  1. Wrap the raw shape object into a `z.object(shape)` schema.
 *  2. Automatically attach `BAD_REQUEST` errors to the builder.
 */
function handleInput(target: object, shape: ValidInputShape): object {
    const schema = z.object(shape as z.ZodRawShape);
    const withInput = (target as BuilderWithInputMethod).input(schema);
    return createProxy(withInput.errors(badRequestError), true);
}

/**
 * Intercepts `.responses(map)` calls to build a Zod union output schema from
 * a `{ [ResponseCode]: ZodSchema }` map, then delegates to the real `.output()`.
 */
function handleResponses(
    target: object,
    responses: Record<string, z.ZodTypeAny | undefined>,
    isAfterInput: boolean,
): object {
    const schemas = Object.entries(responses).map(([code, bodySchema]) => {
        const status = RESPONSE_STATUS[code as ResponseCode];
        const isRedirect = status >= 300 && status < 400;
        const shape = bodySchema
            ? { status: z.literal(status), body: bodySchema }
            : isRedirect
              ? {
                    status: z.literal(status),
                    headers: z.object({ location: z.string() }),
                }
              : { status: z.literal(status) };
        return z.object(shape);
    });

    // z.union requires a tuple of ≥2; fall back to single schema or a default
    const outputSchema: z.ZodTypeAny =
        schemas.length > 1
            ? z.union(
                  schemas as unknown as [
                      z.ZodTypeAny,
                      z.ZodTypeAny,
                      ...z.ZodTypeAny[],
                  ],
              )
            : (schemas[0] ?? z.object({ status: z.literal(200) }));

    // Detect 3xx redirect codes and apply route config
    let builder = target;
    const redirectCode = Object.keys(responses).find((code) => {
        const status = RESPONSE_STATUS[code as ResponseCode];
        return status !== undefined && status >= 300 && status < 400;
    }) as ResponseCode | undefined;

    if (redirectCode) {
        const orpcMeta = (target as Record<string, unknown>)['~orpc'] as
            | Record<string, unknown>
            | undefined;
        const existingRoute = orpcMeta?.route as
            | Record<string, unknown>
            | undefined;
        builder = (builder as BuilderWithRouteMethod).$route({
            ...existingRoute,
            successStatus: RESPONSE_STATUS[redirectCode],
            outputStructure: 'detailed',
        });
    }

    return createProxy(
        (builder as BuilderWithOutputMethod).output(outputSchema),
        isAfterInput,
    );
}

/**
 * Intercepts `.errors(map)` post-input to strip reserved keys before forwarding,
 * preventing accidental overrides of `BAD_REQUEST` / `INTERNAL_SERVER_ERROR`.
 */
function handleErrors(
    target: object,
    errs: Record<string, unknown>,
    isAfterInput: boolean,
): object {
    const { BAD_REQUEST: _, INTERNAL_SERVER_ERROR: __, ...safeErrs } = errs;
    return createProxy(
        (target as BuilderWithErrorsMethod).errors(safeErrs),
        isAfterInput,
    );
}

// ─── Proxy Factory ────────────────────────────────────────────────────────────

/**
 * Wraps an oRPC builder in a `Proxy` that intercepts `.input()`, `.responses()`,
 * and `.errors()` calls to enforce our contract conventions.
 *
 * @param builder - The underlying oRPC builder to wrap.
 * @param isAfterInput - Whether `.input()` has already been called on this chain.
 *   Controls which intercepts are active (e.g. `input` is a no-op after being called).
 */
function createProxy<T extends object>(builder: T, isAfterInput: boolean): T {
    return new Proxy(builder, {
        get(target, prop, receiver) {
            if (!isAfterInput && prop === 'input') {
                return (shape: ValidInputShape) => handleInput(target, shape);
            }
            if (prop === 'responses') {
                return (responses: Record<string, z.ZodTypeAny | undefined>) =>
                    handleResponses(target, responses, isAfterInput);
            }
            if (isAfterInput && prop === 'errors') {
                return (errs: Record<string, unknown>) =>
                    handleErrors(target, errs, isAfterInput);
            }

            // Pass-through: re-wrap returned builders so the proxy chain is preserved
            const value: unknown = Reflect.get(target, prop, receiver);
            if (typeof value === 'function') {
                return (...args: unknown[]): unknown => {
                    const result: unknown = (
                        value as (...a: unknown[]) => unknown
                    ).apply(target, args);
                    if (
                        result !== null &&
                        typeof result === 'object' &&
                        'input' in result
                    ) {
                        return createProxy(result as object, isAfterInput);
                    }
                    return result;
                };
            }
            return value;
        },
    });
}

// ─── Contract Builder ─────────────────────────────────────────────────────────

/**
 * `rb` (route builder) is a thin wrapper around oRPC's `oc` builder that fills
 * in two gaps the raw `oc` API leaves open:
 *
 * 1. **Typed input structure** — `oc` accepts a flat Zod schema for input, with no
 *    enforced distinction between `body`, `query`, `params`, and `headers`. `rb.input()`
 *    takes an explicit `{ body?, query?, params?, headers? }` shape and compiles it into
 *    a `z.object(shape)` automatically, keeping input sources structurally separated.
 *
 * 2. **Typed response responses** — `oc` has no first-class concept of HTTP response codes.
 *    `rb.responses()` accepts a `{ [ResponseCode]: ZodSchema }` map and derives a
 *    discriminated union output schema of `{ status: <literal>, body: <schema> }` objects.
 *
 * Reserved errors (`BAD_REQUEST`, `INTERNAL_SERVER_ERROR`) are injected automatically
 * and cannot be overridden via `.errors()` — they are always present.
 *
 * The returned contract procedure is a standard oRPC contract and can be placed
 * directly inside any `oc.router({})` definition without any extra setup.
 *
 * - `rb.query(path)` — defines a `GET` route.
 * - `rb.mutation(path, method?)` — defines a `POST/PUT/DELETE/PATCH` route (default: `POST`).
 *
 * @example
 * ```ts
 * export const userContract = oc.router({
 *   get: rb.query('/users/:id')
 *     .input({ params: z.object({ id: z.string() }) })
 *     .responses({ OK: UserSchema }),
 *
 *   create: rb.mutation('/users')
 *     .input({ body: z.object({ name: z.string() }) })
 *     .responses({ CREATED: UserSchema }),
 * });
 * ```
 */
export const rb = {
    query: <TPath extends `/${string}`>(path: TPath) =>
        createProxy(
            base
                .$meta({ type: 'query' as const })
                .route({ method: 'GET', path }),
            false,
        ) as unknown as MyContractBuilder<
            Schema<unknown, unknown>,
            Schema<unknown, unknown>,
            BaseErrorMap,
            { type: 'query' }
        >,

    mutation: (
        path: `/${string}`,
        method: 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'POST',
    ) =>
        createProxy(
            base.$meta({ type: 'mutation' as const }).route({ method, path }),
            false,
        ) as unknown as MyContractBuilder<
            Schema<unknown, unknown>,
            Schema<unknown, unknown>,
            BaseErrorMap,
            { type: 'mutation' }
        >,
};
