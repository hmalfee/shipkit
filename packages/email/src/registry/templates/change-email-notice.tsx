import { Heading, Section, Text } from 'react-email';

import { Layout } from './layout';

type ChangeEmailNoticeProps = {
    email: string;
    newEmail: string;
    unsubscribeUrl?: string;
};

function ChangeEmailNotice({
    email,
    newEmail,
    unsubscribeUrl,
}: ChangeEmailNoticeProps) {
    return (
        <Layout
            preview="Your email address was changed"
            unsubscribeUrl={unsubscribeUrl}
        >
            <Text className="text-muted-foreground m-0 text-xs font-medium tracking-[0.12em] uppercase">
                Email update
            </Text>
            <Heading className="text-foreground m-0 mt-4 text-3xl leading-tight font-semibold tracking-tight">
                Your email address was changed
            </Heading>
            <Text className="text-muted-foreground m-0 mt-5 max-w-100 text-base leading-snug">
                The email address on your Shipkit account was changed from{' '}
                <strong className="text-foreground">{email}</strong> to{' '}
                <strong className="text-foreground">{newEmail}</strong>. Sign-in
                codes and account notifications now go to the new address.
            </Text>
            {/* Security callout */}
            <Section className="bg-muted mt-10 px-5 py-5">
                <Text className="text-muted-foreground m-0 text-sm leading-snug font-medium">
                    <strong>Didn&apos;t make this change?</strong> Contact
                    support right away so we can help you secure your account.
                </Text>
            </Section>
        </Layout>
    );
}

ChangeEmailNotice.PreviewProps = {
    email: 'old@example.com',
    newEmail: 'new@example.com',
} satisfies ChangeEmailNoticeProps;

export default ChangeEmailNotice;
