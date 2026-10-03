'use client';

import { useCallback, useEffect, useState } from 'react';

export function useCountdown(initialUntil?: number) {
    const [state, setState] = useState<{ until: number; now: number } | null>(
        () =>
            initialUntil === undefined
                ? null
                : { until: initialUntil, now: Date.now() },
    );

    const start = useCallback((deadline: number) => {
        setState({ until: deadline, now: Date.now() });
    }, []);

    useEffect(() => {
        const until = state?.until;
        if (until === undefined) return;
        const id = setInterval(() => {
            const now = Date.now();
            setState((s) => (s ? { until: s.until, now } : null));
            if (now >= until) clearInterval(id);
        }, 250);
        return () => clearInterval(id);
    }, [state?.until]);

    const secondsLeft = state
        ? Math.max(0, Math.ceil((state.until - state.now) / 1000))
        : 0;

    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;

    return {
        secondsLeft,
        isActive: secondsLeft > 0,
        label: `${m}:${String(s).padStart(2, '0')}`,
        start,
    };
}
