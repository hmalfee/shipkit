import { withSentryConfig as withSentryNextConfig } from '@sentry/nextjs';

import type { NextConfig } from 'next';

export interface SentryConfigOptions {
    org: string;
    project: string;
    authToken: string;
    sentryUrl?: string;
    releaseName?: string;
}

/**
 * Wraps a Next.js configuration with Sentry setup.
 */
export function withSentryConfig(
    config: NextConfig,
    options: SentryConfigOptions,
): NextConfig {
    return withSentryNextConfig(config, {
        org: options.org,
        project: options.project,
        authToken: options.authToken,
        sentryUrl: options.sentryUrl,
        ...(options.releaseName
            ? { release: { name: options.releaseName } }
            : {}),
        widenClientFileUpload: true,
        webpack: {
            autoInstrumentAppDirectory: false,
            autoInstrumentMiddleware: false,
            autoInstrumentServerFunctions: false,
        },
    });
}
