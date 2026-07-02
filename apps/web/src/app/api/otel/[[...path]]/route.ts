import { createOtelIngestHandler } from '@mento-mark/telemetry/source-maps/next/server';

import { env } from '@/env';

const handler = createOtelIngestHandler(env.OTEL_URL);

export { handler as GET, handler as POST };
