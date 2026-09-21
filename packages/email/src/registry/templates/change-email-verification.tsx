import { Button, Heading, Link, Section, Text } from 'react-email';

import { buttonVariants } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { toEmailClasses } from '../../lib/utils';
import { Layout } from './layout';

type ChangeEmailVerificationProps = {
    url: string;
    newEmail: string;
    unsubscribeUrl?: string;
};

function ChangeEmailVerification({
    url,
    newEmail,
    unsubscribeUrl,
}: ChangeEmailVerificationProps) {
    return (
        <Layout
            preview="Verify your new email address"
            unsubscribeUrl={unsubscribeUrl}
        >
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Email update
            </Text>
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Verify your new email
            </Heading>
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                You have requested to change your email address to{' '}
                <strong className="text-foreground">{newEmail}</strong>. Click
                the button below to verify this new email address.
            </Text>

            {/* Verify link CTA button */}
            <Section className="mt-8">
                <Button
                    href={url}
                    className={cn(
                        toEmailClasses(buttonVariants()),
                        'box-border px-6 py-3 text-sm no-underline',
                    )}
                >
                    Verify email address
                </Button>
            </Section>

            {/* Fallback URL */}
            <Text className="text-muted-foreground m-0 mt-6 text-xs">
                Can&apos;t click the button? Copy this link:
            </Text>
            <Text className="m-0 mt-1 text-xs break-all">
                <Link href={url} className="text-primary underline">
                    {url}
                </Link>
            </Text>

            {/* Security callout */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    <strong>Didn&apos;t request this?</strong> You can safely
                    ignore this email. Your email address will not be changed.
                </Text>
            </Section>
        </Layout>
    );
}

ChangeEmailVerification.PreviewProps = {
    url: 'https://shipkit.io/verify',
    newEmail: 'new@example.com',
} satisfies ChangeEmailVerificationProps;

export default ChangeEmailVerification;
