'use client';

import { revalidateLogic, useForm } from '@tanstack/react-form';
import { MailIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CHANGE_EMAIL_STAGES } from '@shipkit/shared/constants';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@shipkit/ui/components/alert';
import { Button } from '@shipkit/ui/components/button';
import {
    Dialog,
    DialogContent,
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@shipkit/ui/components/tooltip';

import { api, useUtils } from '@/lib/api/client';

import type { Route } from 'next';
import type { ReactNode } from 'react';

import { SectionWrapper } from './section-wrapper';

function Emphasis({ children }: { children: ReactNode }) {
    return <strong className="text-foreground font-medium">{children}</strong>;
}

export function ChangeEmailSection({
    email,
    status,
}: {
    email: string;
    status: NonNullable<
        (typeof api.auth.me.$inferOutput)['body']
    >['changeEmailStatus'];
}) {
    const utils = useUtils();
    const [open, setOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const send = api.auth.changeEmail.send.useMutation({
        onSuccess: async () => {
            toast.success(
                'Check your current email inbox for a confirmation link.',
            );
            await utils.auth.me.invalidateQuery();
        },
    });

    const cancel = api.auth.changeEmail.cancel.useMutation({
        onSuccess: async () => {
            toast.success('Email change request cancelled.');
            await utils.auth.me.invalidateQuery();
            setCancelOpen(false);
        },
    });

    const form = useForm({
        defaultValues: { body: { newEmail: '' } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: api.auth.changeEmail.send.inputSchema },
        onSubmit: ({ value, formApi }) =>
            send.mutate(
                {
                    body: {
                        ...value.body,
                        callbackURL: '/profile' satisfies Route,
                    },
                },
                {
                    onSuccess: () => {
                        setOpen(false);
                        formApi.reset();
                    },
                },
            ),
    });

    const pending = status && 'newEmail' in status ? status : undefined;
    const cooldownUntil = status?.disallowedUntil;
    const isCoolingDown =
        !pending && cooldownUntil !== undefined && cooldownUntil > now;

    useEffect(() => {
        if (cooldownUntil === undefined) return;
        const remaining = cooldownUntil - Date.now();
        if (remaining <= 0) return;
        const id = setTimeout(() => setNow(Date.now()), remaining);
        return () => clearTimeout(id);
    }, [cooldownUntil]);

    const changeButton = (
        <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={isCoolingDown}
        >
            Change
        </Button>
    );

    return (
        <>
            <SectionWrapper
                title="Email"
                description="Used to sign in and receive account notifications."
            >
                <Field>
                    <FieldLabel htmlFor="current-email">Email</FieldLabel>
                    <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm">{email}</p>
                        {isCoolingDown ? (
                            <Tooltip>
                                <TooltipTrigger
                                    render={<span className="inline-block" />}
                                >
                                    {changeButton}
                                </TooltipTrigger>
                                <TooltipContent>
                                    You must wait until{' '}
                                    {new Date(cooldownUntil).toLocaleString()}{' '}
                                    to request another email change.
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            changeButton
                        )}
                    </div>
                </Field>

                {pending && (
                    <Alert>
                        <MailIcon />
                        <AlertTitle>Email change pending</AlertTitle>
                        <AlertDescription>
                            <p className="text-wrap">
                                {pending.stage ===
                                CHANGE_EMAIL_STAGES.AwaitingConfirmation ? (
                                    <>
                                        Check <Emphasis>{email}</Emphasis> to
                                        confirm the change to{' '}
                                        <Emphasis>{pending.newEmail}</Emphasis>.
                                    </>
                                ) : (
                                    <>
                                        Verification link sent to{' '}
                                        <Emphasis>{pending.newEmail}</Emphasis>.
                                        Click it to finish the change.
                                    </>
                                )}{' '}
                                <Button
                                    type="button"
                                    variant="link"
                                    className="h-auto p-0 align-baseline"
                                    onClick={() => setCancelOpen(true)}
                                >
                                    Cancel request
                                </Button>
                            </p>
                        </AlertDescription>
                    </Alert>
                )}
            </SectionWrapper>

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) form.reset();
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Change email</DialogTitle>
                        <DialogDescription>
                            We&apos;ll send a confirmation link to{' '}
                            <Emphasis>{email}</Emphasis> first, then a
                            verification link to your new address.
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
                                        .errors as Array<
                                        { message?: string } | undefined
                                    >;
                                    return (
                                        <Field data-invalid={errors.length > 0}>
                                            <FieldLabel htmlFor={field.name}>
                                                New email
                                            </FieldLabel>
                                            <Input
                                                id={field.name}
                                                type="email"
                                                placeholder="you@example.com"
                                                value={field.state.value}
                                                onChange={(e) =>
                                                    field.handleChange(
                                                        e.target.value,
                                                    )
                                                }
                                                onBlur={field.handleBlur}
                                            />
                                            {errors.length > 0 && (
                                                <FieldError errors={errors} />
                                            )}
                                        </Field>
                                    );
                                }}
                            </form.Field>
                            <form.Subscribe selector={(s) => s.canSubmit}>
                                {(canSubmit) => (
                                    <Button
                                        type="submit"
                                        className="w-fit"
                                        disabled={!canSubmit || send.isPending}
                                    >
                                        {send.isPending
                                            ? 'Sending...'
                                            : 'Send confirmation link'}
                                    </Button>
                                )}
                            </form.Subscribe>
                        </FieldGroup>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Cancel email change?</DialogTitle>
                        <DialogDescription>
                            This will cancel your request to change your email
                            to <Emphasis>{pending?.newEmail}</Emphasis>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCancelOpen(false)}
                            disabled={cancel.isPending}
                        >
                            Keep request
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => cancel.mutate(undefined)}
                            disabled={cancel.isPending}
                        >
                            {cancel.isPending
                                ? 'Cancelling...'
                                : 'Cancel request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
