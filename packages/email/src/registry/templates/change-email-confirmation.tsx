import { Button, Column, Heading, Link, Row, Section, Text } from 'react-email';

import { buttonVariants } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { toEmailClasses } from '../../lib/utils';
import { Layout } from './layout';

type ChangeEmailConfirmationProps = {
    url: string;
    currentEmail: string;
    newEmail: string;
    unsubscribeUrl?: string;
};

function ChangeEmailConfirmation({
    url,
    currentEmail,
    newEmail,
    unsubscribeUrl,
}: ChangeEmailConfirmationProps) {
    return (
        <Layout
            preview="Confirm your email change request"
            unsubscribeUrl={unsubscribeUrl}
        >
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Email update
            </Text>
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Confirm email change
            </Heading>
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                You have requested to change your email address. Click the
                button below to confirm this request.
            </Text>

            {/* Email change visual: old -> new */}
            <Section className="border-border bg-muted mt-6 rounded-lg border px-5 py-4">
                <Row>
                    <Column align="center" className="w-[42%]">
                        <Text className="text-muted-foreground m-0 text-sm break-all">
                            {currentEmail}
                        </Text>
                    </Column>
                    <Column align="center" className="w-[16%]">
                        <Text className="text-muted-foreground m-0 text-base">
                            &rarr;
                        </Text>
                    </Column>
                    <Column align="center" className="w-[42%]">
                        <Text className="text-foreground m-0 text-sm font-semibold break-all">
                            {newEmail}
                        </Text>
                    </Column>
                </Row>
            </Section>

            {/* Confirm link CTA button */}
            <Section className="mt-8">
                <Button
                    href={url}
                    className={cn(
                        toEmailClasses(buttonVariants()),
                        'box-border px-6 py-3 text-sm no-underline',
                    )}
                >
                    Confirm email change
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

ChangeEmailConfirmation.PreviewProps = {
    url: 'https://shipkit.io/confirm',
    currentEmail: 'old@example.com',
    newEmail: 'new@example.com',
} satisfies ChangeEmailConfirmationProps;

export default ChangeEmailConfirmation;
