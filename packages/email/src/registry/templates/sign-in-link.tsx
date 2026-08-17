/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from 'react-email';

import { buttonVariants } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { toEmailClasses } from '../../lib/utils';
import { Layout } from './layout';

type SignInLinkProps = {
    signInLink: string;
    expiresInMinutes: number;
    unsubscribeUrl?: string;
};

function SignInLink({
    signInLink,
    expiresInMinutes,
    unsubscribeUrl,
}: SignInLinkProps) {
    return (
        <Layout
            preview="Your sign-in link for Shipkit"
            unsubscribeUrl={unsubscribeUrl}
        >
            {/* Eyebrow label */}
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Sign-in request
            </Text>

            {/* Display heading */}
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Sign in to your account
            </Heading>

            {/* Body copy */}
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                {`We received a sign-in request for your Shipkit account. Click the button below to authenticate. This link expires in ${expiresInMinutes} minutes.`}
            </Text>

            {/* CTA button */}
            <Section className="mt-8">
                <Button
                    href={signInLink}
                    className={cn(
                        toEmailClasses(buttonVariants()),
                        'box-border px-6 py-3 text-sm no-underline',
                    )}
                >
                    Sign in to Shipkit
                </Button>
            </Section>

            {/* Fallback URL — visually quiet, functional */}
            <Text className="text-muted-foreground m-0 mt-6 text-xs">
                Can&apos;t click the button? Copy this link into your browser:
            </Text>
            <Text className="m-0 mt-1 text-xs break-all">
                <Link href={signInLink} className="text-primary underline">
                    {signInLink}
                </Link>
            </Text>

            {/* Security callout — distinct muted block */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    <strong>Didn&apos;t request this?</strong> You can safely
                    ignore this email. Your account is not at risk and no action
                    is required.
                </Text>
            </Section>

            {/* Expiry footnote */}
            <Text className="text-muted-foreground m-0 mt-5 text-xs">
                {`This link expires in ${expiresInMinutes} minutes and can only be used once.`}
            </Text>
        </Layout>
    );
}

SignInLink.PreviewProps = {
    signInLink: 'https://shipkit.io/auth/verify?token=abc123xyz',
    expiresInMinutes: 15,
} satisfies SignInLinkProps;

export default SignInLink;
