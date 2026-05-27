import fs from 'fs';

import { initTelemetry } from '@mento-mark/telemetry';

initTelemetry({
    serviceName: (
        JSON.parse(
            fs
                .readFileSync(new URL('../package.json', import.meta.url))
                .toString(),
        ) as { name: string }
    ).name,
});
