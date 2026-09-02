import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import * as Diff from 'diff';

import {
    AUTH_FILE,
    DIFF_FILE,
    getSchemaBaseline,
    GREEN,
    RED,
    RESET,
    YELLOW,
} from './shared';

export async function runGen(): Promise<boolean> {
    const baseline = await getSchemaBaseline();
    const diffExists = existsSync(DIFF_FILE);

    if (!existsSync(AUTH_FILE)) {
        let output = baseline;

        if (diffExists) {
            const diff = await readFile(DIFF_FILE, 'utf8');
            const applied = Diff.applyPatch(baseline, diff);

            if (applied === false) {
                console.error(
                    `${RED}✖ auth.schema.diff could not be applied to the freshly generated schema.${RESET}\n` +
                        `  The generator's output has likely drifted too far from what the diff expects.\n` +
                        `  Delete auth.schema.diff, rerun 'pnpm db:auth-schema --gen' to get a clean auth.ts, reapply your\n` +
                        `  customizations by hand, then run 'pnpm db:auth-schema --diff' to regenerate the diff.`,
                );
                return false;
            }

            output = applied;
            console.log(
                `${GREEN}✔ Applied existing auth.schema.diff to the freshly generated schema${RESET}`,
            );
        } else {
            console.log(
                `${YELLOW}◷ No auth.schema.diff found — writing generator output as-is${RESET}`,
            );
        }

        await writeFile(AUTH_FILE, output, 'utf8');
        console.log(`${GREEN}✔ Written: ${AUTH_FILE}${RESET}`);

        if (!diffExists) {
            console.log(
                `\n${YELLOW}Need custom tables, columns, indexes, or relations? Edit auth.ts directly.${RESET}\n` +
                    `${YELLOW}Then run 'pnpm db:auth-schema --diff' to save those changes as auth.schema.diff.${RESET}\n`,
            );
        }
        return true;
    }

    // auth.ts already exists — verify it against the baseline, reconciled
    // with any saved customizations.
    const current = await readFile(AUTH_FILE, 'utf8');
    let expected = baseline;

    if (diffExists) {
        const diff = await readFile(DIFF_FILE, 'utf8');
        const applied = Diff.applyPatch(baseline, diff);

        if (applied === false) {
            console.error(
                `${RED}✖ Verification failed: auth.schema.diff no longer applies cleanly to the current auth schema.${RESET}\n` +
                    `  The auth package's generated baseline has changed in a way that conflicts with your saved customizations.\n` +
                    `  Resolve the conflict in auth.ts by hand, then run 'pnpm db:auth-schema --diff' to re-save it.`,
            );
            return false;
        }

        expected = applied;
    }

    if (current !== expected) {
        console.error(
            `${RED}✖ Drift detected: ${AUTH_FILE} does not match the baseline${diffExists ? ' + auth.schema.diff' : ''}.${RESET}\n` +
                `  Either auth.ts was edited without updating auth.schema.diff, or the baseline changed.\n` +
                `  Run 'pnpm db:auth-schema --diff' to snapshot the current customizations, or revert auth.ts.\n` +
                `\n${Diff.createTwoFilesPatch('expected', 'auth.ts', expected, current)}`,
        );
        return false;
    }

    console.log(
        `${GREEN}✔ auth.ts matches the baseline${diffExists ? ' + auth.schema.diff' : ''}${RESET}`,
    );
    return true;
}
