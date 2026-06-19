// oxlint-disable eslint-js/no-restricted-syntax
import { captureRequestError, initSentryServer } from '@mento-mark/sentry/next';

export function register() {
    if (
        process.env.NEXT_RUNTIME === 'nodejs' &&
        process.env.NEXT_PUBLIC_SENTRY_DSN
    ) {
        initSentryServer({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        });
    }
}

export const onRequestError = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? captureRequestError
    : undefined;
