import { chalk, echo } from 'zx';

/**
 * Runs fn and prints how long it took.
 * @template T
 * @param {string} label
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function timed(label, fn) {
    const t0 = Date.now();
    try {
        return await fn();
    } finally {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        echo(chalk.gray(`  ⏱ ${label}: ${secs}s`));
    }
}
