'use client';

import { Button } from '@mento-mark/ui/components/button';

import { isOffline, isServerDown } from '@/lib/api/query-client';

export default function GlobalError({
    error,
    _reset,
}: {
    error: Error & { digest?: string };
    _reset: () => void;
}) {
    const offline = isOffline(error);
    const serverDown = isServerDown(error);

    return (
        <html lang="en" suppressHydrationWarning>
            <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 antialiased">
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
                          : 'A critical error occurred.'}
                </p>
                <Button onClick={() => window.location.reload()}>
                    Try again
                </Button>
            </body>
        </html>
    );
}
