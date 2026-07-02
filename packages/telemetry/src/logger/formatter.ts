import type { LogRecord } from '@logtape/logtape';

const RESET = '\x1b[0m';
const TIMESTAMP_COLOR = '\x1b[38;2;100;140;100m'; // muted green
const CATEGORY_COLOR = '\x1b[38;2;120;120;120m'; // gray

const LEVEL_STYLES: Record<string, { ansi: string; label: string }> = {
    debug: { ansi: '\x1b[48;2;80;80;80m\x1b[30m', label: ' DBG ' },
    info: { ansi: '\x1b[48;2;40;160;80m\x1b[30m', label: ' INF ' },
    warning: { ansi: '\x1b[48;2;200;170;30m\x1b[30m', label: ' WRN ' },
    error: { ansi: '\x1b[48;2;200;50;50m\x1b[30m', label: ' ERR ' },
    fatal: { ansi: '\x1b[48;2;160;40;160m\x1b[30m', label: ' FTL ' },
};

function formatAMPM(timestamp: number) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}.${milliseconds} ${ampm}`;
}

function colorizeLevel(level: string): string {
    const style = LEVEL_STYLES[level];
    if (!style) return ` ${level.toUpperCase()} `;
    return `${style.ansi}${style.label}${RESET}`;
}

/**
 * A console formatter with ANSI-colored output for Node.js terminals.
 *
 * - Timestamp: dim green
 * - Level: boxed with colored background + black text
 * - Category: dimmed
 * - Error objects: appended via `%o` so the terminal prints the stack trace.
 */
export function consoleFormatter(record: LogRecord): unknown[] {
    // Build message string from LogTape template parts
    let msg = '';
    const values: unknown[] = [];
    for (let i = 0; i < record.message.length; i++) {
        if (i % 2 === 0) {
            msg += String(record.message[i]);
        } else {
            msg += '%o';
            values.push(record.message[i]);
        }
    }

    const timestamp = `${TIMESTAMP_COLOR}${formatAMPM(record.timestamp)}${RESET}`;
    const level = colorizeLevel(record.level);
    const category = `${CATEGORY_COLOR}${record.category.join('·')}${RESET}`;

    let formatted = `${timestamp} ${level} ${category} ${msg}`;

    // Append Error objects so the terminal always prints the stack trace
    const error = record.properties?.error ?? record.properties?.err;
    if (error instanceof Error && !values.includes(error)) {
        const isBrowser = typeof window !== 'undefined';
        formatted += ` ${error.message}`;
        formatted += isBrowser ? '\n' : '\n%o';
        return [formatted, ...values, error];
    }

    return [formatted, ...values];
}
