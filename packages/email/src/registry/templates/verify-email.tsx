/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from 'react-email';

import { buttonVariants } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { toEmailClasses } from '../../lib/utils';
import { Layout } from './layout';

type VerifyEmailProps = {
    verifyUrl: string;
    username: string;
    unsubscribeUrl?: string;
};

function VerifyEmail({
    verifyUrl,
    username,
    unsubscribeUrl,
}: VerifyEmailProps) {
    return (
        <Layout
            preview="Please verify your Shipkit email address"
            unsubscribeUrl={unsubscribeUrl}
        >
            {/* Eyebrow label */}
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Email verification
            </Text>

            {/* Display heading */}
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Verify your email address
            </Heading>

            {/* Body copy */}
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                {`Hi ${username}, welcome to Shipkit. Please verify your email address to complete your account setup and unlock all features.`}
            </Text>

            {/* CTA button */}
            <Section className="mt-8">
                <Button
                    href={verifyUrl}
                    className={cn(
                        toEmailClasses(buttonVariants()),
                        'box-border px-6 py-3 text-sm no-underline',
                    )}
                >
                    Verify my email address
                </Button>
            </Section>

            {/* Fallback URL */}
            <Text className="text-muted-foreground m-0 mt-6 text-xs">
                Can&apos;t click the button? Copy this link into your browser:
            </Text>
            <Text className="m-0 mt-1 text-xs break-all">
                <Link href={verifyUrl} className="text-primary underline">
                    {verifyUrl}
                </Link>
            </Text>

            {/* Security callout */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    <strong>Didn&apos;t create an account?</strong> You can
                    safely ignore this email. No account will be created without
                    verification.
                </Text>
            </Section>

            {/* Expiry footnote */}
            <Text className="text-muted-foreground m-0 mt-5 text-xs">
                This verification link expires in 24 hours.
            </Text>
        </Layout>
    );
}

VerifyEmail.PreviewProps = {
    verifyUrl: 'https://shipkit.io/auth/verify?token=abc123xyz',
    username: 'Alfee',
} satisfies VerifyEmailProps;

export default VerifyEmail;
