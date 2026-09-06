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
            let applied = Diff.applyPatch(baseline, diff);

            if (applied === false) {
                // Try with fuzz factor in case new columns/tables shifted the context lines
                applied = Diff.applyPatch(baseline, diff, { fuzzFactor: 10 });

                if (applied === false) {
                    console.error(
                        `${RED}✖ auth.schema.diff could not be applied to the freshly generated schema.${RESET}\n` +
                            `  The generator's output has likely drifted too far from what the diff expects.\n` +
                            `  Delete auth.schema.diff, rerun 'pnpm db:auth-schema --gen' to get a clean auth.ts, and reapply your\n` +
                            `  customizations by hand.`,
                    );
                    return false;
                }
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
                    `${YELLOW}Then run 'pnpm db:auth-schema --gen' again to save those changes as auth.schema.diff.${RESET}\n`,
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
        let applied = Diff.applyPatch(baseline, diff);

        if (applied === false) {
            // Try with fuzz factor in case new columns/tables shifted the context lines
            applied = Diff.applyPatch(baseline, diff, { fuzzFactor: 10 });

            if (applied === false) {
                console.error(
                    `${RED}✖ Verification failed: auth.schema.diff no longer applies cleanly to the current auth schema.${RESET}\n` +
                        `  The auth package's generated baseline has changed in a way that conflicts with your saved customizations.\n` +
                        `  Resolve the conflict in auth.ts by hand, then run 'pnpm db:auth-schema --gen' to re-save it.`,
                );
                return false;
            }

            // Auto-rebase succeeded: absorb new baseline content, re-save diff, and we're done.
            await writeFile(AUTH_FILE, applied, 'utf8');
            const rebasedDiff = Diff.createTwoFilesPatch(
                'baseline',
                'auth.ts',
                baseline,
                applied,
            );
            await writeFile(DIFF_FILE, rebasedDiff, 'utf8');

            console.log(
                `${GREEN}✔ Baseline updated — absorbed new columns/tables, rebased auth.ts and auth.schema.diff${RESET}`,
            );
            return true;
        }

        expected = applied;
    }

    if (current !== expected) {
        // Drift detected. auth.ts was edited manually without running --gen afterward,
        // or we just didn't save the diff yet. We treat auth.ts as the source of truth and snapshot it.
        const newDiff = Diff.createTwoFilesPatch(
            'baseline',
            'auth.ts',
            baseline,
            current,
        );
        await writeFile(DIFF_FILE, newDiff, 'utf8');
        console.log(
            `${GREEN}✔ auth.ts had manual edits — auth.schema.diff updated to reflect them${RESET}`,
        );
        return true;
    }

    // Happy path: everything in sync — re-save diff to ensure it is always current
    const upToDateDiff = Diff.createTwoFilesPatch(
        'baseline',
        'auth.ts',
        baseline,
        current,
    );
    await writeFile(DIFF_FILE, upToDateDiff, 'utf8');

    console.log(
        `${GREEN}✔ auth.ts matches the baseline${diffExists ? ' + auth.schema.diff' : ''} — diff saved${RESET}`,
    );
    return true;
}
