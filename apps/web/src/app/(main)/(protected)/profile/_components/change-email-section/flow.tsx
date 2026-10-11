'use client';

import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';

import {
    CHANGE_EMAIL_MAX_VERIFICATION_SENDS,
    OTP_RESEND_COOLDOWN_SECONDS,
} from '@shipkit/shared/constants';

import { useCountdown } from '@/hooks/use-countdown';
import { api, useUtils } from '@/lib/api/client';

export type Step = 'start' | 'confirmation' | 'newEmail' | 'verification';

export function useChangeEmailFlow(email: string) {
    const utils = useUtils();
    const { confirmation, verification } = api.auth.changeEmail;

    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<Step>('start');
    const [isRestart, setIsRestart] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');
    const [sendsUsed, setSendsUsed] = useState(0);
    const isLastCode = sendsUsed >= CHANGE_EMAIL_MAX_VERIFICATION_SENDS;

    const confCooldown = useCountdown();
    const verifCooldown = useCountdown();

    const goToStart = (restart = false) => {
        setPendingEmail('');
        setSendsUsed(0);
        setIsRestart(restart);
        setStep('start');
    };

    const open = () => {
        goToStart();
        setIsOpen(true);
    };
    const close = () => setIsOpen(false);

    // --- Confirmation ---
    const sendConf = confirmation.send.useMutation({
        onSuccess: () => {
            confCooldown.start(OTP_RESEND_COOLDOWN_SECONDS);
            setStep('confirmation');
        },
    });

    const submitConf = confirmation.submit.useMutation({
        onSuccess: () => setStep('newEmail'),
    });

    // --- Verification ---
    const sendVerif = verification.send.useMutation({
        onSuccess: (_data, vars) => {
            setPendingEmail(vars.body.newEmail.trim());
            setSendsUsed((n) => n + 1);
            verifCooldown.start(OTP_RESEND_COOLDOWN_SECONDS);
            if (step === 'verification') {
                toast.success('Verification code sent again.');
            }
            setStep('verification');
        },
    });

    const submitVerif = verification.submit.useMutation({
        onSuccess: async () => {
            setIsOpen(false);
            toast.success('Email updated.');
            await utils.auth.me.invalidateQuery();
        },
    });

    const isBusy = [sendConf, submitConf, sendVerif, submitVerif].some(
        (m) => m.isPending,
    );

    const onOpenChange = (open: boolean) => {
        if (!open && !isBusy) close();
    };

    return {
        isOpen,
        step,
        isRestart,
        isBusy,
        open,
        close,
        onOpenChange,
        confirmation: {
            email,
            send: () => sendConf.mutate(undefined),
            submit: (otp: string) => submitConf.mutate({ body: { otp } }),
            isSending: sendConf.isPending,
            isSubmitting: submitConf.isPending,
            cooldown: confCooldown,
            schema: confirmation.submit.inputSchema,
            isLastCode: false,
        },
        verification: {
            email: pendingEmail,
            send: () => sendVerif.mutate({ body: { newEmail: pendingEmail } }),
            sendTo: (newEmail: string) =>
                sendVerif.mutate({ body: { newEmail } }),
            submit: (otp: string) => submitVerif.mutate({ body: { otp } }),
            isSending: sendVerif.isPending,
            isSubmitting: submitVerif.isPending,
            cooldown: verifCooldown,
            schema: verification.submit.inputSchema,
            newEmailSchema: verification.send.inputSchema,
            isLastCode,
            changeAddress: () =>
                isLastCode ? goToStart(true) : setStep('newEmail'),
        },
    };
}

export type Flow = ReturnType<typeof useChangeEmailFlow>;
export const FlowContext = createContext<Flow | null>(null);

export function useFlow() {
    const context = useContext(FlowContext);
    if (!context) throw new Error('useFlow must be used within a FlowContext');
    return context;
}
