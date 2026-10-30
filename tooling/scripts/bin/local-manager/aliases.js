import { chalk, echo } from 'zx';

import { allocatePorts, run, runSync, toEnvKey } from './utils.js';

/**
 * Registers one static portless route per name, each pointing at its own
 * freshly allocated port, and exports `<NAME>_PORT` for the child command.
 *
 * Each name is pushed onto `registered` the moment it succeeds, so if a later
 * registration fails (and we `process.exit`), the session's exit handler
 * still knows exactly what to remove.
 *
 * `--force` overwrites any existing alias of the same name. That recovers
 * leftovers from a previous crashed run, but it will equally take over an
 * alias owned by another *live* session, whose route then disappears when
 * this session exits. Concurrent sessions must not reuse a name.
 *
 * @param {string[]} names
 * @param {string[]} registered Mutated: names successfully registered so far.
 */
export async function registerAliases(names, registered) {
    const ports = await allocatePorts(names.length);
    for (const [i, name] of names.entries()) {
        const port = ports[i];
        const res = await run`portless alias ${name} ${port} --force`;
        if (res.exitCode !== 0) {
            echo(
                chalk.red(
                    `Failed to register route "${name}" → :${port}\n` +
                        (res.stderr || res.stdout),
                ),
            );
            process.exit(1);
        }
        registered.push(name);
        const key = toEnvKey(name);
        process.env[`${key}_PORT`] = String(port);
        echo(chalk.blue(`  ${name} → :${port}  (${key}_PORT)`));
    }
}

/**
 * Aliases have no owning PID and survive `portless prune`, so they must be
 * removed explicitly on teardown.
 */
export async function removeAliases(names) {
    for (const name of names) await run`portless alias --remove ${name}`;
}

/** Sync twin of {@link removeAliases}, for `process.on('exit')`. */
export function removeAliasesSync(names) {
    for (const name of names) runSync`portless alias --remove ${name}`;
}
