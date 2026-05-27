import { z } from 'zod';

import type { ZodRawShape } from 'zod';

/** Represents a single validation rule for environment variables. */
export type ValidationRule<TData = Record<string, unknown>> = {
    keys: string[];
    message: string;
    validate: (data: TData) => boolean;
};

function createRulesBuilder<TSchema extends ZodRawShape>(_schema: TSchema) {
    type EnvKey = Extract<keyof TSchema, string>;
    type EnvData = Record<EnvKey, unknown>;

    return {
        atLeastOne: (
            keys: [EnvKey, EnvKey, ...EnvKey[]],
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys,
            message:
                message ??
                `At least one of [${keys.join(', ')}] must be provided`,
            validate: (data) => keys.some((k) => data[k] != null),
        }),

        exactlyOne: (
            keys: [EnvKey, EnvKey, ...EnvKey[]],
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys,
            message:
                message ??
                `Exactly one of [${keys.join(', ')}] must be provided`,
            validate: (data) =>
                keys.filter((k) => data[k] != null).length === 1,
        }),

        allOrNone: (
            keys: [EnvKey, EnvKey, ...EnvKey[]],
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys,
            message:
                message ??
                `Either all of [${keys.join(', ')}] must be provided, or none`,
            validate: (data) => {
                const count = keys.filter((k) => data[k] != null).length;
                return count === 0 || count === keys.length;
            },
        }),

        ifThen: (
            condition: EnvKey,
            required: [EnvKey, ...EnvKey[]],
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys: [condition, ...required],
            message:
                message ??
                `If ${condition} is provided, then [${required.join(', ')}] must also be provided`,
            validate: (data) => {
                if (data[condition] == null) return true;
                return required.every((k) => data[k] != null);
            },
        }),

        ifValueThen: <K extends EnvKey>(
            condition: K,
            expectedValue: EnvData[K],
            required: [EnvKey, ...EnvKey[]],
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys: [condition, ...required],
            message:
                message ??
                `If ${condition} is "${String(expectedValue)}", then [${required.join(', ')}] must be provided`,
            validate: (data) => {
                if (data[condition] !== expectedValue) return true;
                return required.every((k) => data[k] != null);
            },
        }),

        mutuallyExclusive: (
            keyA: EnvKey,
            keyB: EnvKey,
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys: [keyA, keyB],
            message:
                message ?? `${keyA} and ${keyB} cannot be provided together`,
            validate: (data) => !(data[keyA] != null && data[keyB] != null),
        }),

        custom: (<K extends EnvKey>(
            keys: [K] | [K, ...K[]],
            validate: (values: Pick<EnvData, K>) => boolean,
            message?: string,
        ): ValidationRule<EnvData> => ({
            keys,
            message:
                message ?? `Custom validation failed for [${keys.join(', ')}]`,
            validate: (data) => {
                const selectedData = Object.fromEntries(
                    keys.map((k) => [k, data[k]]),
                ) as Pick<EnvData, K>;
                return validate(selectedData);
            },
        })) as {
            <K extends EnvKey>(
                keys: [K],
                validate: (value: EnvData[K]) => boolean,
                message?: string,
            ): ValidationRule<EnvData>;
            <K extends EnvKey>(
                keys: [K, K, ...K[]],
                validate: (values: Pick<EnvData, K>) => boolean,
                message?: string,
            ): ValidationRule<EnvData>;
        },
    };
}

/** Fluent API for building environment validation rules. */
export type RulesBuilder<TShape extends ZodRawShape> = ReturnType<
    typeof createRulesBuilder<TShape>
>;

/**
 * Applies validation rules to a Zod schema using superRefine.
 * Use this in the `createFinalSchema` callback of @t3-oss/env-core.
 *
 * @example
 * applyRules(shape, (rules) => [
 *     rules.atLeastOne(["PISTON_URL", "ONE_COMPILER_LITE_API_KEY"]),
 *     rules.allOrNone(["SENTRY_AUTH_TOKEN", "SENTRY_ORG_SLUG"]),
 * ])
 */
export function applyRules<TShape extends ZodRawShape>(
    shape: TShape,
    rulesCallback: (
        rules: RulesBuilder<TShape>,
    ) => ValidationRule<Record<string, unknown>>[],
) {
    const rulesBuilder = createRulesBuilder(shape);
    const rules = rulesCallback(rulesBuilder);

    return z.object(shape).superRefine((data, ctx) => {
        for (const rule of rules) {
            if (!rule.validate(data)) {
                for (const key of rule.keys) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: rule.message,
                        path: [key],
                    });
                }
            }
        }
    });
}
