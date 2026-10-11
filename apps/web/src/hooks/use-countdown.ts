'use client';

import { useCallback, useEffect, useState } from 'react';

export function useCountdown() {
    // Absolute deadline (ms). Kept so the countdown stays accurate even if the
    // tab is throttled in the background: each tick recomputes from the clock.
    const [until, setUntil] = useState<number | null>(null);
    const [secondsLeft, setSecondsLeft] = useState(0);

    const start = useCallback((seconds: number) => {
        setUntil(Date.now() + seconds * 1000);
        setSecondsLeft(Math.max(0, Math.ceil(seconds)));
    }, []);

    useEffect(() => {
        if (until === null) return;
        const id = setInterval(() => {
            const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            setSecondsLeft(left); // same value => React bails out, no re-render
            if (left === 0) clearInterval(id);
        }, 250);
        return () => clearInterval(id);
    }, [until]);

    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;

    return {
        secondsLeft,
        isActive: secondsLeft > 0,
        label: `${m}:${String(s).padStart(2, '0')}`,
        start,
    };
}
