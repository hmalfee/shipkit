import '@mento-mark/ui/globals.css';

import { Geist, Geist_Mono } from 'next/font/google';

import Header from '@/components/header';
import Providers from '@/components/providers';
import { ssr } from '@/lib/api/ssr';

import type { Metadata } from 'next';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'MentoMark',
    description: 'MentoMark',
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    await ssr.auth.me.prefetchQuery();

    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <Providers>
                    <ssr.HydrateClient>
                        <div className="grid h-svh grid-rows-[auto_1fr]">
                            <Header />
                            {children}
                        </div>
                    </ssr.HydrateClient>
                </Providers>
            </body>
        </html>
    );
}
