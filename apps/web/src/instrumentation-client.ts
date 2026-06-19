import { captureRouterTransitionStart } from '@mento-mark/sentry/next';
import { initSentry } from '@mento-mark/sentry/react';

import { env } from './env';

if (env.NEXT_PUBLIC_SENTRY_DSN) {
    initSentry({
        dsn: env.NEXT_PUBLIC_SENTRY_DSN,
        tunnel: '/api/ingest-st',
    });
}

export const onRouterTransitionStart = env.NEXT_PUBLIC_SENTRY_DSN
    ? captureRouterTransitionStart
    : () => {
          /* empty */
      };
