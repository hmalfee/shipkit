'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { QueryIdentitySync } from '@mento-mark/posthog/react';
import { Toaster } from '@mento-mark/ui/components/sonner';

import { api, APIProvider } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/query-client';

import { ThemeProvider } from './theme-provider';

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => createQueryClient());
    const { $inferOutput, queryKey } = api.auth.me;

    return (
        <APIProvider queryClient={queryClient}>
            <QueryIdentitySync<typeof $inferOutput>
                queryKey={queryKey()}
                identifierAccessor="body.id"
            />
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
            >
                {children}
                <Toaster richColors />
            </ThemeProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </APIProvider>
    );
}
