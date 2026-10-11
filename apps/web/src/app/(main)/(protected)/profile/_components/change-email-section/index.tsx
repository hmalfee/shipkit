'use client';

import { useEffect, useState } from 'react';

import { Button } from '@shipkit/ui/components/button';
import { Dialog, DialogContent } from '@shipkit/ui/components/dialog';
import { Field, FieldLabel } from '@shipkit/ui/components/field';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@shipkit/ui/components/tooltip';

import type { api } from '@/lib/api/client';

import { SectionWrapper } from '../section-wrapper';
import { FlowContext, useChangeEmailFlow } from './flow';
import { NewEmailStep, OtpStep, StartStep } from './steps';

/** The email row, plus the dialogs that walk through the change. */
export function ChangeEmailSection({
    email,
    status,
}: {
    email: string;
    status: NonNullable<
        (typeof api.auth.me.$inferOutput)['body']
    >['changeEmailStatus'];
}) {
    const flow = useChangeEmailFlow(email);
    const [now, setNow] = useState(() => Date.now());

    // Server-side rate limit: after a change, another one is blocked until then.
    const cooldownUntil = status?.disallowedUntil;
    const isCoolingDown = cooldownUntil !== undefined && cooldownUntil > now;

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
            onClick={flow.open}
            disabled={isCoolingDown}
        >
            Change
        </Button>
    );

    return (
        <FlowContext value={flow}>
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
            </SectionWrapper>

            <Dialog open={flow.isOpen} onOpenChange={flow.onOpenChange}>
                <DialogContent className="sm:max-w-sm">
                    {flow.step === 'start' && <StartStep />}
                    {flow.step === 'confirmation' && (
                        <OtpStep stage="confirmation" />
                    )}
                    {flow.step === 'newEmail' && <NewEmailStep />}
                    {flow.step === 'verification' && (
                        <OtpStep stage="verification" />
                    )}
                </DialogContent>
            </Dialog>
        </FlowContext>
    );
}
