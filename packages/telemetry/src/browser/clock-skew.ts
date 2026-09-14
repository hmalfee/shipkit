import { hrTimeToMilliseconds, millisToHrTime } from '@opentelemetry/core';

import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import { DelegatingSpanProcessor } from '../processor-base';
import { parseServerTimeHeader } from '../server-timing';

const SERVER_START_ATTR = 'server.request_start_ms';
const SERVER_END_ATTR = 'server.request_end_ms';

/** Extracts the server timing from a response and attaches it to the span for skew correction. */
export function captureServerTimingFromResponse(
    span: Span,
    response: Response,
): void {
    const parsed = parseServerTimeHeader(response.headers);
    if (parsed) {
        span.setAttribute(SERVER_START_ATTR, parsed.serverStart);
        span.setAttribute(SERVER_END_ATTR, parsed.serverEnd);
    }
}

export class ClockSkewCorrectingSpanProcessor extends DelegatingSpanProcessor {
    override onEnd(span: ReadableSpan): void {
        const attrs = span.attributes as Record<string, unknown>;
        const serverStart = attrs[SERVER_START_ATTR];
        const serverEnd = attrs[SERVER_END_ATTR];

        if (typeof serverStart !== 'number' || typeof serverEnd !== 'number') {
            this._delegate.onEnd(span);
            return;
        }

        delete attrs[SERVER_START_ATTR];
        delete attrs[SERVER_END_ATTR];

        // Client wall-clock time when the request was sent
        const clientStart = hrTimeToMilliseconds(span.startTime);
        // Client wall-clock time when the response finished
        const clientEnd = hrTimeToMilliseconds(span.endTime);

        //  Cristian's-algorithm-style offset estimate (assumes request-leg
        // latency ≈ response-leg latency), anchored to the exact round trip
        // being traced — so there's no path asymmetry to introduce error.
        const offset =
            (serverStart - clientStart + (serverEnd - clientEnd)) / 2;

        if (offset !== 0) {
            const mutable = span as unknown as {
                startTime: [number, number];
                endTime: [number, number];
            };
            mutable.startTime = millisToHrTime(clientStart + offset);
            mutable.endTime = millisToHrTime(clientEnd + offset);
            for (const event of span.events) {
                const e = event as unknown as { time: [number, number] };
                e.time = millisToHrTime(
                    hrTimeToMilliseconds(event.time) + offset,
                );
            }
            attrs['client.clock_offset_ms'] = Math.round(offset);
        }

        this._delegate.onEnd(span);
    }
}
