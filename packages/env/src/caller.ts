import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CallSite {
    getFileName(): string | undefined;
}

/**
 * Uses the V8 stack trace API to determine the directory of the file that called `createEnv`.
 * Resolves the package root and skips any frames from within the `@mento-mark/env` package
 * to find the external consumer's directory.
 */
export function getCallerDir(): string | undefined {
    if (typeof window !== 'undefined') return undefined;

    // oxlint-disable-next-line @typescript-eslint/unbound-method -- false positive: prepareStackTrace is a static property, not a bound method
    const originalFunc = Error.prepareStackTrace;
    let callerfile: string | undefined;

    try {
        const err = new Error();
        Error.prepareStackTrace = (_, stack) => stack;
        const stack = err.stack as unknown as CallSite[];

        const currentfile = stack.shift()?.getFileName();
        if (!currentfile) throw new Error('No current file');

        const normalize = (f: string) =>
            f.startsWith('file://') ? fileURLToPath(f) : f;

        // Resolve package root (packages/env/) from src/ directory
        const currentDir = path.dirname(normalize(currentfile));
        const packageRoot = path.dirname(currentDir);

        // Find first frame outside the package directory
        for (const frame of stack) {
            const file = frame.getFileName();
            if (!file) continue;

            const normalizedFile = normalize(file);
            // Check if file is outside package root
            if (!normalizedFile.startsWith(packageRoot)) {
                callerfile = normalizedFile;
                break;
            }
        }
    } catch {
        // Ignore errors
    } finally {
        Error.prepareStackTrace = originalFunc;
    }

    if (callerfile) {
        return path.dirname(callerfile);
    }

    return undefined;
}
