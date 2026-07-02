'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

import { logger } from '@mento-mark/telemetry/logger';
import { Button } from '@mento-mark/ui/components/button';

import { isOffline, isServerDown } from '@/lib/api/query-client';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();
    // returns the current query client instance within the provider
    const queryClient = useQueryClient();
    const [isPending, startTransition] = useTransition();
    const offline = isOffline(error);
    const serverDown = isServerDown(error);
    const logged = useRef(false);

    useEffect(() => {
        if (logged.current) return;
        logged.current = true;
        if (offline || serverDown) return;
        if (error.digest) return;
        logger.error('[Error Boundary]', { error });
    }, [error, offline, serverDown]);

    return (
        <main className="flex min-h-[calc(100vh-4.5rem)] flex-col items-center justify-center gap-4 p-6">
            <h1 className="text-2xl font-bold">
                {offline
                    ? "You're offline"
                    : serverDown
                      ? 'Server unreachable'
                      : 'Something went wrong!'}
            </h1>
            <p className="text-muted-foreground">
                {offline
                    ? 'Check your internet connection and try again.'
                    : serverDown
                      ? 'We could not reach the server. Please try again later.'
                      : 'An unexpected error occurred.'}
            </p>
            <Button
                onClick={() => {
                    startTransition(() => {
                        void queryClient.resetQueries();
                        router.refresh();
                        reset();
                    });
                }}
                disabled={isPending}
            >
                {isPending && <Loader className="animate-spin" />}
                Try again
            </Button>
        </main>
    );
}
