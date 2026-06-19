import { createSentryTunnelHandler } from '@mento-mark/sentry/next/tunnel';

import { env } from '@/env';

const handler = createSentryTunnelHandler(env.NEXT_PUBLIC_SENTRY_DSN);

export { handler as GET, handler as POST };
