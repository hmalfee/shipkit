/**
 * auth-schema — CLI for keeping src/pg/schema/auth.ts in sync with @shipkit/auth.
 *
 * Two-stage pipeline:
 *
 *   --gen       TEXTUAL stage. Operates purely on strings — no imports, no runtime.
 *               On first run: writes auth.ts from the @shipkit/auth baseline.
 *               On subsequent runs: verifies auth.ts matches baseline + saved
 *               customizations (auth.schema.diff), and snapshots any manual edits
 *               back into auth.schema.diff so they survive the next upstream update.
 *               Intentionally trusts the diff file as-is — it does NOT check
 *               whether the resulting auth.ts is a valid Drizzle schema. A diff that
 *               removes required tables will apply cleanly here; --validate catches that.
 *
 *   --validate  SEMANTIC stage. Imports the live auth.ts module and checks that every
 *               table and column @shipkit/auth requires is present with the right type.
 *               This is the contract gate — it fails if auth.ts is structurally broken
 *               or missing required fields, regardless of how it got that way.
 *
 *   --all       Runs gen → validate in order. Use this in CI or after editing auth.ts
 *               to catch both textual drift and semantic contract violations in one pass.
 *
 * Flags may be combined (e.g. `--gen --validate`); they always execute in the fixed
 * order gen → validate. --all overrides any other flags. Stops at the first failure.
 */
import { runGen } from './gen';
import { runValidate } from './validate';

const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const FLAGS = ['--gen', '--validate', '--all'] as const;
type Flag = (typeof FLAGS)[number];

function printUsage() {
    console.log(`Usage: auth-schema [flags]

  --gen         Textual stage: write/sync auth.ts from the @shipkit/auth baseline and
                snapshot any manual edits into auth.schema.diff. Does not import the
                schema — purely string-level, intentionally blind to Drizzle semantics.
  --validate    Semantic stage: import auth.ts and verify it satisfies @shipkit/auth's
                required tables, columns, and types. The contract gate.
  --all         Run gen → validate in order (overrides other flags)

Flags may be combined; they always run in the order gen → validate.
Passing --all runs all steps regardless of any other flags given.`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exitCode = args.length === 0 ? 1 : 0;
        return;
    }

    const unknown = args.filter((arg) => !FLAGS.includes(arg as Flag));
    if (unknown.length > 0) {
        console.error(
            `${RED}✖ Unknown flag(s): ${unknown.join(', ')}${RESET}\n`,
        );
        printUsage();
        process.exitCode = 1;
        return;
    }

    const runAll = args.includes('--all');

    const steps: [Flag, () => Promise<boolean>][] = [
        ['--gen', runGen],
        ['--validate', runValidate],
    ];

    for (const [flag, run] of steps) {
        if (!runAll && !args.includes(flag)) continue;

        const ok = await run();
        if (!ok) {
            process.exitCode = 1;
            return;
        }
    }
}

void main();
