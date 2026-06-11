import type { z } from 'zod';
import type { RulesBuilder, ValidationRule } from './rules-builder';

/** Schema record mapping variable names to Zod validators. */
export type ZodSchema = Record<string, z.ZodType>;

/** Infers the TypeScript type from a Zod schema record. */
export type InferSchema<T extends ZodSchema> = {
    [K in keyof T]: z.infer<T[K]>;
};

export type CreateEnvOptions<
    TServer extends ZodSchema,
    TClient extends ZodSchema,
    TExtra extends ZodSchema = NonNullable<unknown>,
    TPrefix extends string | undefined = undefined,
> = {
    /** Optional explicit directory to load `.env` from. Defaults to the caller's directory. */
    envDir?: string;

    /** Prefix for client-side variables (e.g., `'NEXT_PUBLIC_'`). */
    clientPrefix?: TPrefix;

    /** Schema for server-only environment variables. */
    server?: TServer;

    /**
     * Schema for client-side environment variables.
     * All keys must start with the `clientPrefix` if one is provided.
     */
    client?: TPrefix extends string
        ? {
              [K in keyof TClient]: K extends `${TPrefix}${string}`
                  ? TClient[K]
                  : `Error: Key '${K & string}' must start with '${TPrefix}'`;
          }
        : TClient;

    /** Define cross-field validation rules (e.g., mutually exclusive keys). */
    rules?: (
        rules: RulesBuilder<TServer & TClient & TExtra>,
    ) => ValidationRule<Record<string, unknown>>[];
} & (keyof TClient extends never
    ? { clientAccess?: never }
    : {
          /**
           * Required when `client` schemas are defined.
           * Maps every client key to its `process.env.KEY` reference to ensure
           * bundlers (like Next.js) can statically analyze and inline them.
           */
          clientAccess: Record<
              NoInfer<keyof TClient>,
              string | boolean | number | undefined
          >;
      });
