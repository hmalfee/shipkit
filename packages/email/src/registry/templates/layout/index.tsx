/** @jsxImportSource react */
import React from 'react';
import {
    Body,
    Container,
    Head,
    Hr,
    Html,
    Link,
    pixelBasedPreset,
    Preview,
    Section,
    Tailwind,
    Text,
} from 'react-email';

import type { TailwindConfig } from 'react-email';

import { extractTokens } from './extract-tokens';

const { colors, borderRadius } = extractTokens();

const emailTailwindConfig: TailwindConfig = {
    presets: [pixelBasedPreset],
    theme: {
        extend: {
            colors,
            borderRadius,
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Segoe UI"',
                    'Roboto',
                    '"Helvetica Neue"',
                    'Arial',
                    'sans-serif',
                ],
            },
        },
    },
};

type Props = {
    preview: string;
    children: React.ReactNode;
    /** URL for unsubscribing. When provided, an unsubscribe link will be rendered in the footer. */
    unsubscribeUrl?: string;
};

export function Layout({ preview, children, unsubscribeUrl }: Props) {
    return (
        <Tailwind config={emailTailwindConfig}>
            <Html lang="en">
                <Head>
                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1.0"
                    />
                    {/* We do not support dark mode for now. Lock to light mode to prevent aggressive auto-inversion in some clients. */}
                    <meta name="color-scheme" content="light" />
                    <meta name="supported-color-schemes" content="light" />
                </Head>
                <Preview>{preview}</Preview>
                {/* bg-muted outer body gives a subtle grey lift behind the card */}
                <Body className="bg-muted font-sans">
                    <div
                        dangerouslySetInnerHTML={{
                            __html: `<!--[if mso]><table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation"><tr><td><![endif]-->`,
                        }}
                    />
                    <Container className="bg-background border-border border">
                        {/* ── Header ── */}
                        <Section className="px-10 py-8">
                            <Text className="text-foreground m-0 text-base leading-snug font-semibold tracking-tight">
                                Shipkit
                            </Text>
                        </Section>

                        {/* ── Separator ── */}
                        <Hr className="border-border m-0 border-t" />

                        {/* ── Content card ── */}
                        <Section className="px-10 pt-14 pb-12">
                            {children}
                        </Section>

                        {/* ── Separator ── */}
                        <Hr className="border-border m-0 border-t" />

                        {/* ── Footer ── */}
                        <Section className="px-10 pt-10 pb-8">
                            {/* Tagline */}
                            <Text className="text-muted-foreground m-0 max-w-[320px] text-xs">
                                Shipkit — the modern SaaS starter kit.
                            </Text>

                            {/* Unsubscribe + account notice */}
                            <Text className="text-muted-foreground m-0 mt-5 text-xs">
                                You received this because you have an account
                                with Shipkit.
                                {unsubscribeUrl && (
                                    <>
                                        {' '}
                                        <Link
                                            href={unsubscribeUrl}
                                            className="text-muted-foreground underline"
                                        >
                                            Unsubscribe
                                        </Link>
                                        .
                                    </>
                                )}
                            </Text>

                            {/* Copyright */}
                            <Text className="text-muted-foreground m-0 mt-3 text-xs">
                                {`© ${new Date().getFullYear()} Shipkit. All rights reserved.`}
                            </Text>
                        </Section>
                    </Container>
                    <div
                        dangerouslySetInnerHTML={{
                            __html: `<!--[if mso]></td></tr></table><![endif]-->`,
                        }}
                    />
                </Body>
            </Html>
        </Tailwind>
    );
}
