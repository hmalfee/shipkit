import { Button, Heading, Link, Section, Text } from 'react-email';

import { buttonVariants } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { toEmailClasses } from '../../lib/utils';
import { Layout } from './layout';

type EmailSignInProps = {
    magicLink: string;
    otp: string; // 6-digit numeric string e.g. "048291" — always digits
    expiresInMinutes: number;
    unsubscribeUrl?: string;
};

function EmailSignIn({
    magicLink,
    otp,
    expiresInMinutes,
    unsubscribeUrl,
}: EmailSignInProps) {
    return (
        <Layout
            preview="Your sign-in link for Shipkit"
            unsubscribeUrl={unsubscribeUrl}
        >
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Sign-in request
            </Text>
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Sign in to your account
            </Heading>
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                {`We received a sign-in request for your Shipkit account. Click the button below or enter the code on the sign-in page. This link expires in ${expiresInMinutes} minutes.`}
            </Text>

            {/* Sign-in link CTA button */}
            <Section className="mt-8">
                <Button
                    href={magicLink}
                    className={cn(
                        toEmailClasses(buttonVariants()),
                        'box-border px-6 py-3 text-sm no-underline',
                    )}
                >
                    Sign in to Shipkit
                </Button>
            </Section>

            {/* Numeric OTP block */}
            <Text className="text-muted-foreground m-0 mt-8 text-xs font-medium tracking-widest uppercase">
                Or enter this 6-digit code on the sign-in page:
            </Text>
            <Section className="bg-muted mt-4 rounded-lg px-5 py-4 text-center">
                <Text className="text-foreground m-0 font-mono text-4xl font-bold tracking-[0.35em]">
                    {otp}
                </Text>
            </Section>

            {/* Fallback URL */}
            <Text className="text-muted-foreground m-0 mt-6 text-xs">
                Can&apos;t click the button? Copy this link:
            </Text>
            <Text className="m-0 mt-1 text-xs break-all">
                <Link href={magicLink} className="text-primary underline">
                    {magicLink}
                </Link>
            </Text>

            {/* Security callout */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    <strong>Didn&apos;t request this?</strong> You can safely
                    ignore this email.
                </Text>
            </Section>

            <Text className="text-muted-foreground m-0 mt-5 text-xs">
                {`This link expires in ${expiresInMinutes} minutes and can only be used once.`}
            </Text>
        </Layout>
    );
}

EmailSignIn.PreviewProps = {
    magicLink: 'https://shipkit.io/verify',
    otp: '048291',
    expiresInMinutes: 15,
} satisfies EmailSignInProps;

export default EmailSignIn;
