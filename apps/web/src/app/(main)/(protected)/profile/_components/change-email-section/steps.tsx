'use client';

import { revalidateLogic, useForm } from '@tanstack/react-form';

import { OTP_LENGTH } from '@shipkit/shared/constants';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@shipkit/ui/components/alert';
import { Button } from '@shipkit/ui/components/button';
import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shipkit/ui/components/dialog';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@shipkit/ui/components/field';
import { Input } from '@shipkit/ui/components/input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@shipkit/ui/components/input-otp';

import type { ReactNode } from 'react';

import { useFlow } from './flow';

/** The two screens where the user types an emailed code. */
export type OtpStage = 'confirmation' | 'verification';

type FieldErrors = Array<{ message?: string } | undefined>;

/** Per-stage copy. */
const OTP_COPY: Record<
    OtpStage,
    {
        title: string;
        hint: string;
        label: string;
        submit: string;
        submitting: string;
    }
> = {
    confirmation: {
        title: 'Enter confirmation code',
        hint: '',
        label: 'Confirmation code',
        submit: 'Confirm code',
        submitting: 'Confirming...',
    },
    verification: {
        title: 'Enter verification code',
        hint: 'Enter it to finish changing your email.',
        label: 'Verification code',
        submit: 'Verify code',
        submitting: 'Verifying...',
    },
};

function Emphasis({ children }: { children: ReactNode }) {
    return <strong className="text-foreground font-medium">{children}</strong>;
}
function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return email;

    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!domain) return email;

    // Reveal less for short names, never the whole thing
    const visible = local.length > 5 ? 2 : 1;

    return `${local.slice(0, visible)}•••@${domain}`;
}

export function StartStep() {
    const flow = useFlow();
    return (
        <>
            <DialogHeader>
                <DialogTitle>
                    {flow.isRestart
                        ? 'Confirm your email again'
                        : 'Change your email?'}
                </DialogTitle>
                <DialogDescription>
                    {flow.isRestart ? (
                        <>
                            We&apos;ll send a new {OTP_LENGTH}-digit code to{' '}
                            <Emphasis>
                                {maskEmail(flow.confirmation.email)}
                            </Emphasis>{' '}
                            so you can start over.
                        </>
                    ) : (
                        <>
                            To make sure it&apos;s you, we&apos;ll send a{' '}
                            {OTP_LENGTH}-digit code to{' '}
                            <Emphasis>
                                {maskEmail(flow.confirmation.email)}
                            </Emphasis>
                            . You&apos;ll enter it next, then choose your new
                            email address.
                        </>
                    )}
                </DialogDescription>
            </DialogHeader>
            {flow.isRestart && (
                <Alert>
                    <AlertTitle>No verification codes left</AlertTitle>
                    <AlertDescription>
                        You&apos;ve used all the verification codes allowed for
                        one email change. To keep your account safe, confirm
                        your current email again to start over.
                    </AlertDescription>
                </Alert>
            )}
            <DialogFooter>
                <Button
                    variant="outline"
                    onClick={flow.close}
                    disabled={flow.confirmation.isSending}
                >
                    Cancel
                </Button>
                <Button
                    className="tabular-nums"
                    onClick={flow.confirmation.send}
                    disabled={
                        flow.confirmation.isSending ||
                        flow.confirmation.cooldown.isActive
                    }
                >
                    {flow.confirmation.isSending
                        ? 'Sending...'
                        : flow.confirmation.cooldown.isActive
                          ? `Send code in ${flow.confirmation.cooldown.label}`
                          : 'Send code'}
                </Button>
            </DialogFooter>
        </>
    );
}

/** Enter the code sent to the current email (confirmation) or the new one (verification). */
export function OtpStep({ stage }: { stage: OtpStage }) {
    const flow = useFlow();
    const resource = flow[stage];
    const {
        email,
        send,
        submit,
        isSending,
        isSubmitting,
        cooldown,
        schema,
        isLastCode,
    } = resource;
    const copy = OTP_COPY[stage];

    const displayEmail = stage === 'confirmation' ? maskEmail(email) : email;

    const form = useForm({
        defaultValues: { body: { otp: '' } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: schema },
        onSubmit: ({ value }) => submit(value.body.otp),
    });

    return (
        <>
            <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>
                    We sent a {OTP_LENGTH}-digit code to{' '}
                    <Emphasis>{displayEmail}</Emphasis>. {copy.hint}
                </DialogDescription>
            </DialogHeader>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void form.handleSubmit();
                }}
            >
                <FieldGroup>
                    <form.Field name="body.otp">
                        {(field) => {
                            const errors = field.state.meta
                                .errors as FieldErrors;
                            return (
                                <Field
                                    data-invalid={errors.length > 0}
                                    data-disabled={isSubmitting}
                                >
                                    <FieldLabel htmlFor={field.name}>
                                        {copy.label}
                                    </FieldLabel>
                                    <InputOTP
                                        maxLength={OTP_LENGTH}
                                        pattern={'^\\d+$'}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        id={field.name}
                                        value={field.state.value}
                                        onChange={(v) => {
                                            field.handleChange(v);
                                            // Submit as soon as the code is complete.
                                            if (v.length === OTP_LENGTH) {
                                                void form.handleSubmit();
                                            }
                                        }}
                                        readOnly={isSubmitting}
                                        containerClassName={
                                            isSubmitting
                                                ? 'opacity-70'
                                                : undefined
                                        }
                                    >
                                        <InputOTPGroup>
                                            {Array.from(
                                                { length: OTP_LENGTH },
                                                (_, i) => (
                                                    <InputOTPSlot
                                                        key={i}
                                                        index={i}
                                                    />
                                                ),
                                            )}
                                        </InputOTPGroup>
                                    </InputOTP>
                                    {errors.length > 0 && (
                                        <FieldError errors={errors} />
                                    )}
                                </Field>
                            );
                        }}
                    </form.Field>
                    <div className="flex items-center justify-between gap-2">
                        <form.Subscribe selector={(s) => s.canSubmit}>
                            {(canSubmit) => (
                                <Button
                                    type="submit"
                                    disabled={!canSubmit || isSubmitting}
                                >
                                    {isSubmitting
                                        ? copy.submitting
                                        : copy.submit}
                                </Button>
                            )}
                        </form.Subscribe>
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 tabular-nums"
                            onClick={() => {
                                form.reset();
                                if (isLastCode)
                                    flow.verification.changeAddress();
                                else send();
                            }}
                            disabled={
                                isSending ||
                                isSubmitting ||
                                (cooldown.isActive && !isLastCode)
                            }
                        >
                            {isSending
                                ? 'Sending...'
                                : !isLastCode && cooldown.isActive
                                  ? `Resend code in ${cooldown.label}`
                                  : 'Resend code'}
                        </Button>
                    </div>
                    {stage === 'verification' && (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto w-fit p-0"
                            onClick={flow.verification.changeAddress}
                            disabled={isSending || isSubmitting}
                        >
                            Use a different email
                        </Button>
                    )}
                </FieldGroup>
            </form>
        </>
    );
}

/** Enter the new address. Prefilled when coming back from the verification step. */
export function NewEmailStep() {
    const flow = useFlow();
    const resource = flow.verification;
    const form = useForm({
        defaultValues: { body: { newEmail: resource.email } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: resource.newEmailSchema },
        onSubmit: ({ value }) => resource.sendTo(value.body.newEmail),
    });

    return (
        <>
            <DialogHeader>
                <DialogTitle>Enter your new email</DialogTitle>
                <DialogDescription>
                    Code confirmed. Enter the address you want to use instead
                    and we&apos;ll send a verification code there.
                </DialogDescription>
            </DialogHeader>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void form.handleSubmit();
                }}
            >
                <FieldGroup>
                    <form.Field name="body.newEmail">
                        {(field) => {
                            const errors = field.state.meta
                                .errors as FieldErrors;
                            return (
                                <Field
                                    data-invalid={errors.length > 0}
                                    data-disabled={resource.isSending}
                                >
                                    <FieldLabel htmlFor={field.name}>
                                        New email
                                    </FieldLabel>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        type="email"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        value={field.state.value}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
                                        disabled={resource.isSending}
                                    />
                                    {errors.length > 0 && (
                                        <FieldError errors={errors} />
                                    )}
                                </Field>
                            );
                        }}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.canSubmit}>
                        {(canSubmit) => {
                            const isThrottled = resource.cooldown.isActive;
                            return (
                                <Button
                                    type="submit"
                                    className="w-fit tabular-nums"
                                    disabled={
                                        !canSubmit ||
                                        resource.isSending ||
                                        isThrottled
                                    }
                                >
                                    {resource.isSending
                                        ? 'Sending...'
                                        : isThrottled
                                          ? `Send again in ${resource.cooldown.label}`
                                          : 'Send verification code'}
                                </Button>
                            );
                        }}
                    </form.Subscribe>
                </FieldGroup>
            </form>
        </>
    );
}
