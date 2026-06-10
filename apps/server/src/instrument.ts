import fs from 'fs';

import { initTelemetry } from '@mento-mark/telemetry';
import { logger } from '@mento-mark/telemetry/logger';

initTelemetry({
    serviceName: (
        JSON.parse(
            fs
                .readFileSync(new URL('../package.json', import.meta.url))
                .toString(),
        ) as { name: string }
    ).name,
});

process.on('uncaughtException', (err) => {
    logger.error('uncaughtException:', err);
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    logger.error('unhandledRejection:', err);
    process.exit(1);
});
