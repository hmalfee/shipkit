import '@shipkit/ui/globals.css';

import { Geist, Geist_Mono } from 'next/font/google';

import Providers from '@/components/providers';

import type { Metadata } from 'next';

const fontSans = Geist({
    variable: '--font-sans',
    subsets: ['latin'],
});
const fontMono = Geist_Mono({
    variable: '--font-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'shipkit',
    description: 'shipkit',
    icons: {
        icon: 'data:,', // Prevents the browser from requesting an external favicon
    },
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontMono.variable} antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
