import posthog from 'posthog-js';

import { logger } from '@shipkit/telemetry/logger';

export function initPostHogWebAnalytics({
    apiKey,
    apiHost,
    urlIgnoreList,
}: {
    apiKey: string;
    apiHost?: string;
    urlIgnoreList?: RegExp[];
}) {
    if (posthog.__loaded) return;

    posthog.init(apiKey, {
        api_host: apiHost,
        defaults: '2026-05-30',
        advanced_disable_flags: true,
        autocapture: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_performance: false,
        debug: false,

        before_send: (event) => {
            if (!event) return null;

            const currentPath = window.location.pathname;
            const currentFullUrl = window.location.href;

            if (urlIgnoreList && urlIgnoreList.length > 0) {
                const shouldIgnore = urlIgnoreList.some(
                    (regex) =>
                        regex.test(currentPath) || regex.test(currentFullUrl),
                );

                if (shouldIgnore) {
                    logger.info(
                        `[PostHog] 🛑 Event dropped via URL ignore list match: ${currentPath}`,
                    );
                    return null;
                }
            }

            return event;
        },

        loaded: (ph) => {
            ph.on('eventCaptured', (event: { event: string }) => {
                logger.info(`[PostHog] ✓ ${event.event} event sent`);
            });
        },
    });
}

export { posthog };
