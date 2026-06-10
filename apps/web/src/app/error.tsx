'use client';

import { Loader } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

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
    const [isPending, startTransition] = useTransition();
    const offline = isOffline(error);
    const serverDown = isServerDown(error);

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
