'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { Toaster } from '@mento-mark/ui/components/sonner';

import { APIProvider } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/query-client';

import { ThemeProvider } from './theme-provider';

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => createQueryClient());

    return (
        <APIProvider queryClient={queryClient}>
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
