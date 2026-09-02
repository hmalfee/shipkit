import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { getTableColumns, getTableName, is, Table } from 'drizzle-orm';

import { generateAuthSchema } from '@shipkit/auth/db';

import type { DBFieldType } from '@shipkit/auth/db';
import type { Column, ColumnDataType } from 'drizzle-orm';

import { AUTH_FILE, GREEN, RED, RESET, YELLOW } from './shared';

/** Which Drizzle `column.dataType`s satisfy a given @shipkit/auth `field.type`. */
function compatibleDataTypes(authType: DBFieldType): ColumnDataType[] {
    // Literal-value enums (e.g. `type: ['user', 'admin']`) are a single
    // scalar column restricted to those values — typically a pg enum —
    // not an array field, despite being expressed as a JS array here.
    if (Array.isArray(authType)) return ['string'];

    switch (authType) {
        case 'string':
            return ['string'];
        case 'number':
            return ['number'];
        case 'boolean':
            return ['boolean'];
        case 'date':
            return ['date'];
        case 'json':
            return ['json'];
        case 'string[]':
        case 'number[]':
            return ['array', 'json']; // arrays are sometimes stored as jsonb
        default:
            // Exhaustiveness check: this line fails to type-check if
            // a new DBFieldType variant is added that we haven't handled.
            return authType satisfies never;
    }
}

function loadDrizzleTables(schemaModule: Record<string, unknown>) {
    const byTableName = new Map<string, Record<string, Column>>();
    const byExportName = new Map<string, Record<string, Column>>();

    for (const [exportName, value] of Object.entries(schemaModule)) {
        if (!is(value, Table)) continue;

        const columns = getTableColumns(value);
        byTableName.set(getTableName(value), columns);
        byExportName.set(exportName, columns);
    }

    return { byTableName, byExportName };
}

export async function runValidate(): Promise<boolean> {
    if (!existsSync(AUTH_FILE)) {
        console.error(
            `${RED}✖ ${AUTH_FILE} does not exist.${RESET}\n` +
                `  Run 'pnpm db:auth-schema --gen' first to generate it.`,
        );
        return false;
    }

    const { tables } = await generateAuthSchema();

    const schemaModule = (await import(
        pathToFileURL(AUTH_FILE).href
    )) as Record<string, unknown>;
    const { byTableName, byExportName } = loadDrizzleTables(schemaModule);

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const { name, fields } of tables) {
        const columns = byTableName.get(name) ?? byExportName.get(name);

        if (!columns) {
            errors.push(`Table "${name}" is missing from auth.ts`);
            continue;
        }

        for (const [fieldKey, field] of Object.entries(fields)) {
            const columnName = field.fieldName ?? fieldKey;
            const column =
                columns[fieldKey] ??
                Object.values(columns).find((c) => c.name === columnName);

            if (!column) {
                errors.push(
                    `Field "${name}.${columnName}" is missing from auth.ts`,
                );
                continue;
            }

            const expectedTypes = compatibleDataTypes(field.type);
            if (!expectedTypes.includes(column.dataType)) {
                errors.push(
                    `Field "${name}.${columnName}" has type "${column.dataType}", expected one of [${expectedTypes.join(', ')}] (@shipkit/auth type: "${String(field.type)}")`,
                );
            }

            if (field.required && !column.notNull) {
                if (!column.hasDefault) {
                    warnings.push(
                        `Field "${name}.${columnName}" is required by @shipkit/auth but nullable in auth.ts without a default`,
                    );
                }
            }

            if (field.unique && !column.isUnique) {
                warnings.push(
                    `Field "${name}.${columnName}" is marked unique by @shipkit/auth but has no unique constraint in auth.ts`,
                );
            }
        }
    }

    if (warnings.length > 0) {
        console.log(
            `${YELLOW}⚠ Warnings:${RESET}\n` +
                warnings.map((w) => `${YELLOW}  - ${w}${RESET}`).join('\n'),
        );
    }

    if (errors.length > 0) {
        console.error(
            `${RED}✖ auth.ts is missing things @shipkit/auth requires:${RESET}\n` +
                errors.map((e) => `${RED}  - ${e}${RESET}`).join('\n'),
        );
        return false;
    }

    console.log(
        `${GREEN}✔ auth.ts satisfies everything @shipkit/auth's config requires${warnings.length > 0 ? ' (see warnings above)' : ''}${RESET}`,
    );
    return true;
}
