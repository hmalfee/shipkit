import { createInterface } from 'node:readline/promises';

import { chalk, echo } from 'zx';

/**
 * Displays a numbered list and returns the chosen item.
 * Accepts the item's number or its exact string value.
 * On non-TTY stdin throws with the list of available choices.
 *
 * @template T
 * @param {string} title
 * @param {T[]} items
 * @param {(item: T) => string} [label]  - defaults to String(item)
 * @returns {Promise<T>}
 */
export async function chooseOne(title, items, label = String) {
    if (!process.stdin.isTTY) {
        throw new Error(
            `Not an interactive terminal; pass the choice explicitly.\nAvailable: ${items.map(label).join(', ')}`,
        );
    }
    items.forEach((item, i) => echo(`  ${i + 1}) ${label(item)}`));
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.on('SIGINT', () => {
        rl.close();
        process.exit(130);
    });
    try {
        for (;;) {
            const answer = (
                await rl.question(chalk.blue(`${title} [1-${items.length}]: `))
            ).trim();
            const byIndex = items[Number(answer) - 1];
            const byLabel = items.find((i) => label(i) === answer);
            if (byIndex !== undefined) return byIndex;
            if (byLabel !== undefined) return byLabel;
            echo(chalk.red(`  Invalid choice "${answer}"`));
        }
    } finally {
        rl.close();
    }
}
