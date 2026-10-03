import { type ChangeEmailStage } from '@shipkit/shared/constants';

export type QuotaData = {
    count: number; // completed changes in the current window
    windowStart: number; // timestamp of the first completed change in the window
    lastChangeAt?: number; // timestamp of the most recent completed change
};

export type PendingEmailChange = {
    newEmail: string;
    stage: ChangeEmailStage;
    token: string; // confirmation token in stage 1, verification token in stage 2
};

export type TokenOwner = { userId: string };

export type ChangeEmailPluginOptions = {
    onSendChangeEmail?: {
        confirmation: (payload: {
            currentEmail: string;
            newEmail: string;
            token: string;
            callbackURL: string;
        }) => Promise<void>;
        verification: (payload: {
            newEmail: string;
            token: string;
            callbackURL: string;
        }) => Promise<void>;
    };
    expiresInMinutes?: number;
    resendCooldownSeconds?: number;
};
