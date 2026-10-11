import { Heading, Section, Text } from 'react-email';

import { OTP_LENGTH } from '@shipkit/shared/constants';

import type { ReactNode } from 'react';

import { Layout } from './layout';

type ChangeEmailCodeProps = {
    stage: 'confirmation' | 'verification';
    otp: string;
    email: string;
    expiresInMinutes: number;
    unsubscribeUrl?: string;
};

const STAGE_COPY: Record<
    ChangeEmailCodeProps['stage'],
    {
        preview: string;
        heading: string;
        body: (email: string) => ReactNode;
        callout: () => ReactNode;
    }
> = {
    confirmation: {
        preview: 'Confirm your email change request',
        heading: "Confirm it's you",
        body: (email) => (
            <>
                Enter the code below in the app to continue changing the email
                address on your Shipkit account (
                <strong className="text-foreground">{email}</strong>).
            </>
        ),
        callout: () => (
            <>
                <strong>Didn&apos;t request this?</strong> Your email address
                won&apos;t be changed without this code. You can safely ignore
                this email, and consider signing out of your other devices.
            </>
        ),
    },
    verification: {
        preview: 'Verify your new email address',
        heading: 'Verify your new email',
        body: (email) => (
            <>
                You requested to change your Shipkit email address to{' '}
                <strong className="text-foreground">{email}</strong>. Use the
                code below to verify this address and complete the change.
            </>
        ),
        callout: () => (
            <>
                <strong>Didn&apos;t request this?</strong> You can safely ignore
                this email. Your email address will not be changed.
            </>
        ),
    },
};

function ChangeEmailCode({
    stage,
    otp,
    email,
    expiresInMinutes,
    unsubscribeUrl,
}: ChangeEmailCodeProps) {
    const copy = STAGE_COPY[stage];

    return (
        <Layout preview={copy.preview} unsubscribeUrl={unsubscribeUrl}>
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Email update
            </Text>
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                {copy.heading}
            </Heading>
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                {copy.body(email)}
            </Text>
            <Text className="text-muted-foreground m-0 mt-8 text-xs font-medium tracking-widest uppercase">
                Enter this {OTP_LENGTH}-digit code in the app:
            </Text>
            <Section className="bg-muted mt-4 rounded-lg px-5 py-4 text-center">
                <Text className="text-foreground m-0 font-mono text-4xl font-bold tracking-[0.35em]">
                    {otp}
                </Text>
            </Section>
            {/* Security callout */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    {copy.callout()}
                </Text>
            </Section>
            <Text className="text-muted-foreground m-0 mt-5 text-xs">
                {`Never share this code. It expires in ${expiresInMinutes} minutes and can only be used once.`}
            </Text>
        </Layout>
    );
}

ChangeEmailCode.PreviewProps = {
    stage: 'confirmation',
    otp: String(Math.floor(Math.random() * Math.pow(10, OTP_LENGTH))).padStart(
        OTP_LENGTH,
        '0',
    ),
    email: 'old@example.com',
    expiresInMinutes: 10,
} satisfies ChangeEmailCodeProps;

export default ChangeEmailCode;
