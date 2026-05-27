# @mento-mark/telemetry

Robust, vendor-agnostic OpenTelemetry (OTel) instrumentation for Mento Mark monorepo services.

Provides unified Tracing, Logging, and Metrics.

## Installation

```bash
pnpm add @mento-mark/telemetry
```

## Setup

Initialize at the entry point of your application (before any other imports):

```ts
import { initTelemetry } from '@mento-mark/telemetry';

initTelemetry({ serviceName: 'my-service' });
```

## Local Dev

Start the local Grafana LGTM stack:

```bash
docker compose -f packages/telemetry/docker-compose.yml up
```

Set your app to export to:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Open Grafana at `http://localhost:3000`.

## Tracing

Tracing provides visibility into the lifecycle of a request as it travels through different services and functions.

```ts
import { startSpan, addSpanEvent, withBaggage, getBaggageValue } from '@mento-mark/telemetry/tracing';

// Create a new span to measure a specific operation
await startSpan('process_payment', {}, async (span) => {
    span.setAttribute('payment.method', 'credit_card');

    // Add point-in-time events
    addSpanEvent('payment.attempt', { retry_count: 1 });

    // Operations inside will be tracked within this span
    await db.process(...);
});

// Use Baggage to propagate context down the call chain
withBaggage({ 'user.plan': 'premium' }, () => {
    // any child spans created here will carry this baggage
});

const plan = getBaggageValue('user.plan');
```

## Logging

A customized Winston logger that automatically injects trace context (Trace ID, Span ID) into your logs.

```ts
import { logger } from '@mento-mark/telemetry/logger';

// Standard logging levels
logger.info('User logged in', { userId: '123' });
logger.warn('Rate limit approaching');
logger.error('Database connection failed', new Error('timeout'));

// Create a child logger with bound attributes
const jobLogger = logger.child({ jobId: 'sync-users' });
jobLogger.info('Starting job');
```

## Metrics

Exposes standard OpenTelemetry Metrics API for custom instrumentation:

```ts
import {
    createCounter,
    createHistogram,
    createObservableGauge,
    createUpDownCounter,
} from '@mento-mark/telemetry/metrics';

// Counters: Monotonically increasing values
const signups = createCounter('auth.signups.total', {
    description: 'Total signups',
});
signups.add(1, { method: 'google' });

// Histograms: Distribution of values (duration, sizes)
const duration = createHistogram('http.server.request.duration', { unit: 's' });
duration.record(0.142, { method: 'GET', route: '/api/users' });

// UpDownCounters: Values that can go up and down
const activeJobs = createUpDownCounter('worker.jobs.active');
activeJobs.add(1); // Job started
activeJobs.add(-1); // Job finished

// Observable Gauges: Asynchronous readings (memory, CPU)
createObservableGauge('process.memory', { unit: 'By' }).addCallback(
    (result) => {
        result.observe(process.memoryUsage().heapUsed);
    },
);
```

## Automatic HTTP Metrics (Hono)

The Hono middleware `telemetry()` automatically records:

| Metric                         | Type          | Unit        | Attributes            |
| ------------------------------ | ------------- | ----------- | --------------------- |
| `http.server.request.duration` | Histogram     | `s`         | method, route, status |
| `http.server.request.total`    | Counter       | `{request}` | method, route, status |
| `http.server.active_requests`  | UpDownCounter | `{request}` | method                |

Uses `http.route` (matched route pattern) to prevent cardinality explosion.

The SDK also auto-instruments outbound `fetch()` calls via Undici and collects Node runtime metrics.

## Exports Reference

| Path                                 | Description                                                           |
| ------------------------------------ | --------------------------------------------------------------------- |
| `@mento-mark/telemetry`              | `initTelemetry`, `shutdownTelemetry`                                  |
| `@mento-mark/telemetry/logger`       | Winston logger instance                                               |
| `@mento-mark/telemetry/tracing`      | `startSpan`, `tracer`, `getActiveSpan`, `addSpanEvent`, `withBaggage` |
| `@mento-mark/telemetry/metrics`      | `createCounter`, `createHistogram`, etc.                              |
| `@mento-mark/telemetry/middleware/*` | `telemetry()` middleware                                              |

## Environment Variables

| Variable                      | Description                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP Collector endpoint (e.g. `http://localhost:4318`). If set, traces, logs, and metrics are exported. |
| `NODE_ENV`                    | `production` / `development` (affects log level and exporters)                                          |
