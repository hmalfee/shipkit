'use client';

import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useRouter } from 'next/navigation';
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
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@shipkit/ui/components/tooltip';

import { useCountdown } from '@/hooks/use-countdown';
import { api, useUtils } from '@/lib/api/client';

import { useAuthRedirect } from './auth-redirect-context';
import { OAuthButtons } from './oauth-buttons';

type FieldErrors = Array<{ message?: string } | undefined>;
type Countdown = ReturnType<typeof useCountdown>;

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

function EmailStage({
    countdown,
    throttledEmail,
    onSent,
}: {
    countdown: Countdown;
    throttledEmail: string | null;
    onSent: (email: string, resendAvailableAt: number) => void;
}) {
    const redirectPath = useAuthRedirect();
    const { useMutation, inputSchema } = api.auth.email.signIn;
    const signIn = useMutation({
        onSuccess: (data, vars) => {
            toast.success(
                'Check your inbox — we sent you a magic link and a 6-digit code.',
            );
            onSent(vars.body.email, data.body.resendAvailableAt);
        },
    });

    // True while a resend cooldown is running for this specific address.
    const isThrottledFor = (email: string) =>
        countdown.isActive && throttledEmail === email.trim().toLowerCase();

    const form = useForm({
        defaultValues: { body: { email: '' } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: inputSchema },
        onSubmit: async ({ value }) => {
            // Defensive: the button is disabled, but never fire while throttled
            // (e.g. a stale closure or programmatic submit).
            if (isThrottledFor(value.body.email)) return;
            signIn.mutate({
                body: { ...value.body, callbackURL: redirectPath },
            });
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
                    email: state.values.body.email,
                    isPending: signIn.isPending,
                })}
            >
                {({ canSubmit, email, isPending }) => {
                    const isThrottled = isThrottledFor(email);

                    const submitButton = (
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!canSubmit || isPending || isThrottled}
                        >
                            {isPending ? 'Sending...' : 'Continue with email'}
                        </Button>
                    );

                    return (
                        <>
                            <form.Field name="body.email">
                                {(field) => (
                                    <Field
                                        data-invalid={
                                            field.state.meta.errors.length > 0
                                        }
                                        data-disabled={isPending}
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
                                                field.handleChange(
                                                    e.target.value,
                                                )
                                            }
                                            onBlur={field.handleBlur}
                                            disabled={isPending}
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

                            {isThrottled ? (
                                <Tooltip>
                                    {/* A disabled button emits no pointer/focus events,
                                        so a wrapper span acts as the trigger. */}
                                    <TooltipTrigger
                                        render={
                                            <span className="block w-full" />
                                        }
                                    >
                                        {submitButton}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        We already sent a sign-in link to this
                                        email. You can request another shortly.
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                submitButton
                            )}
                        </>
                    );
                }}
            </form.Subscribe>
        </form>
    );
}

function OtpStage({
    email,
    countdown,
    onBack,
}: {
    email: string;
    countdown: Countdown; // now owned by AuthForm
    onBack: () => void;
}) {
    const redirectPath = useAuthRedirect();
    const router = useRouter();
    const utils = useUtils();

    const resend = api.auth.email.signIn.useMutation({
        onSuccess: (data) => {
            countdown.start(data.body.resendAvailableAt);
            form.reset();
            toast.success(
                'Check your inbox — we resent the magic link and code.',
            );
        },
    });

    const { useMutation, inputSchema } = api.auth.email.verifyOtp;
    const verifyOtp = useMutation({
        onSuccess: (data) => {
            void utils.auth.me.invalidateQuery();
            const firstName = data.body.name.split(' ')[0] ?? 'back';
            toast.success(`Welcome back, ${firstName}!`);
            router.push(redirectPath);
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

    const isBusy = verifyOtp.isPending || resend.isPending;

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
                                    data-disabled={isBusy}
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
                                        readOnly={isBusy}
                                        containerClassName={
                                            isBusy ? 'opacity-70' : undefined
                                        }
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
                            {verifyOtp.isPending
                                ? 'Verifying...'
                                : 'Verify code'}
                        </Button>
                    </>
                )}
            </form.Subscribe>
            <div className="flex items-center justify-center gap-3 text-sm">
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-auto p-0 tabular-nums"
                    disabled={isBusy || countdown.isActive}
                    onClick={() =>
                        resend.mutate({
                            body: { email, callbackURL: redirectPath },
                        })
                    }
                >
                    {resend.isPending
                        ? 'Resending...'
                        : countdown.isActive
                          ? `Resend in ${countdown.label}`
                          : 'Resend'}
                </Button>
                <span className="text-muted-foreground">&middot;</span>
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-auto p-0"
                    onClick={onBack}
                    disabled={isBusy}
                >
                    Use a different email
                </Button>
            </div>
        </form>
    );
}

export default function AuthForm() {
    // The email currently shown on the OTP stage (null = on the email stage).
    const [sent, setSent] = useState<{ email: string } | null>(null);
    // The sanitized email the running cooldown applies to. Survives going
    // back to the email stage, which is the whole point of lifting it here.
    const [throttledEmail, setThrottledEmail] = useState<string | null>(null);
    const countdown = useCountdown();

    return (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
            {sent ? (
                <AuthHeader
                    title="Check your inbox"
                    subtitle={
                        <>
                            Click the magic link we sent to{' '}
                            <strong>{sent.email}</strong>
                        </>
                    }
                />
            ) : (
                <AuthHeader
                    title="Sign in to Shipkit"
                    subtitle="Enter your email or continue with a provider"
                />
            )}

            {!sent && (
                <>
                    <OAuthButtons />
                    <FieldSeparator className="my-0">
                        Or continue with email
                    </FieldSeparator>
                </>
            )}

            {sent ? (
                <OtpStage
                    email={sent.email}
                    countdown={countdown}
                    onBack={() => setSent(null)}
                />
            ) : (
                <EmailStage
                    countdown={countdown}
                    throttledEmail={throttledEmail}
                    onSent={(email, resendAvailableAt) => {
                        setSent({ email });
                        setThrottledEmail(email.trim().toLowerCase());
                        countdown.start(resendAvailableAt);
                    }}
                />
            )}
        </div>
    );
}
