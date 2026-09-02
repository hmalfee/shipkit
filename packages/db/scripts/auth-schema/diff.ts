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
} from './shared';

export async function runDiff(): Promise<boolean> {
    if (!existsSync(AUTH_FILE)) {
        console.error(
            `${RED}✖ ${AUTH_FILE} does not exist.${RESET}\n` +
                `  Run 'pnpm db:auth-schema --gen' first to generate it.`,
        );
        return false;
    }

    const baseline = await getSchemaBaseline();
    const current = await readFile(AUTH_FILE, 'utf8');

    if (current === baseline) {
        console.log(
            `${GREEN}✔ auth.ts matches the generator output — nothing to diff${RESET}`,
        );
        return true;
    }

    const diff = Diff.createTwoFilesPatch(
        'baseline',
        'auth.ts',
        baseline,
        current,
    );
    await writeFile(DIFF_FILE, diff, 'utf8');
    console.log(`${GREEN}✔ Saved your customizations to: ${DIFF_FILE}${RESET}`);
    return true;
}
