'use client';

import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@shipkit/ui/components/button';
import {
    Field,
    FieldError,
    FieldLabel,
    FieldSeparator,
} from '@shipkit/ui/components/field';
import { Input } from '@shipkit/ui/components/input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@shipkit/ui/components/input-otp';

import { api, useUtils } from '@/lib/api/client';

import { OAuthButtons } from './oauth-buttons';

type FieldErrors = Array<{ message?: string } | undefined>;

function AuthHeader({
    title,
    subtitle,
}: {
    title: string;
    subtitle: React.ReactNode;
}) {
    return (
        <div className="text-center">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
    );
}

function EmailStage({ onSent }: { onSent: (email: string) => void }) {
    const { useMutation, inputSchema } = api.auth.email.signIn;
    const signIn = useMutation({
        onSuccess: (_, vars) => {
            toast.success(
                'Check your inbox — we sent you a magic link and a 6-digit code.',
            );
            onSent(vars.body.email);
        },
    });

    const form = useForm({
        defaultValues: { body: { email: '' } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: inputSchema },
        onSubmit: async ({ value }) => {
            signIn.mutate({ body: { ...value.body, callbackURL: '/' } });
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
            }}
            className="space-y-4"
        >
            <form.Subscribe
                selector={(state) => ({
                    canSubmit: state.canSubmit,
                    isPending: signIn.isPending,
                })}
            >
                {({ canSubmit, isPending }) => (
                    <>
                        <form.Field name="body.email">
                            {(field) => (
                                <Field
                                    data-invalid={
                                        field.state.meta.errors.length > 0
                                    }
                                >
                                    <FieldLabel htmlFor={field.name}>
                                        Email address
                                    </FieldLabel>
                                    <Input
                                        id={field.name}
                                        type="email"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        value={field.state.value}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
                                    />
                                    {field.state.meta.errors.length > 0 && (
                                        <FieldError
                                            errors={
                                                field.state.meta
                                                    .errors as FieldErrors
                                            }
                                        />
                                    )}
                                </Field>
                            )}
                        </form.Field>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!canSubmit || isPending}
                        >
                            {isPending ? 'Sending...' : 'Continue with email'}
                        </Button>
                    </>
                )}
            </form.Subscribe>
        </form>
    );
}

function OtpStage({ email, onBack }: { email: string; onBack: () => void }) {
    const utils = useUtils();

    const { useMutation, inputSchema } = api.auth.email.verifyOtp;
    const verifyOtp = useMutation({
        onSuccess: (data) => {
            void utils.auth.me.invalidateQuery();
            const firstName = data.body.name.split(' ')[0] ?? 'back';
            toast.success(`Welcome back, ${firstName}!`);
        },
    });

    const form = useForm({
        defaultValues: { body: { email, otp: '' } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: inputSchema },
        onSubmit: async ({ value }) => {
            verifyOtp.mutate(value);
        },
    });

    const handleOtpComplete = () => {
        void form.handleSubmit();
    };

    const isBusy = verifyOtp.isPending;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
            }}
            className="space-y-4"
        >
            <div className="space-y-1">
                <p className="text-sm">
                    We sent a magic link to <strong>{email}</strong>.
                </p>
                <p className="text-muted-foreground text-xs">
                    Or enter the 6-digit code from the email below.
                </p>
            </div>
            <form.Subscribe
                selector={(state) => ({
                    canSubmit: state.canSubmit,
                })}
            >
                {({ canSubmit }) => (
                    <>
                        <form.Field name="body.otp">
                            {(field) => (
                                <Field
                                    data-invalid={
                                        field.state.meta.errors.length > 0
                                    }
                                >
                                    <FieldLabel htmlFor={field.name}>
                                        Sign-in code
                                    </FieldLabel>
                                    <InputOTP
                                        maxLength={6}
                                        pattern={'^\\d+$'}
                                        inputMode="numeric"
                                        value={field.state.value}
                                        onChange={(v) => {
                                            field.handleChange(v);
                                            if (v.length === 6)
                                                handleOtpComplete();
                                        }}
                                        disabled={isBusy}
                                        autoComplete="one-time-code"
                                        id={field.name}
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} />
                                            <InputOTPSlot index={1} />
                                            <InputOTPSlot index={2} />
                                            <InputOTPSlot index={3} />
                                            <InputOTPSlot index={4} />
                                            <InputOTPSlot index={5} />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </Field>
                            )}
                        </form.Field>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!canSubmit || isBusy}
                        >
                            {isBusy ? 'Verifying...' : 'Verify code'}
                        </Button>
                    </>
                )}
            </form.Subscribe>
            <Button
                type="button"
                variant="link"
                size="sm"
                className="w-full"
                onClick={onBack}
            >
                Use a different email
            </Button>
        </form>
    );
}

export default function AuthForm() {
    const [email, setEmail] = useState<string | null>(null);

    return (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
            {email ? (
                <AuthHeader
                    title="Check your inbox"
                    subtitle={
                        <>
                            Click the magic link we sent to{' '}
                            <strong>{email}</strong>
                        </>
                    }
                />
            ) : (
                <AuthHeader
                    title="Sign in to Shipkit"
                    subtitle="Enter your email or continue with a provider"
                />
            )}

            {!email && (
                <>
                    <OAuthButtons />
                    <FieldSeparator className="my-0">
                        Or continue with email
                    </FieldSeparator>
                </>
            )}

            {email ? (
                <OtpStage email={email} onBack={() => setEmail(null)} />
            ) : (
                <EmailStage onSent={setEmail} />
            )}
        </div>
    );
}
