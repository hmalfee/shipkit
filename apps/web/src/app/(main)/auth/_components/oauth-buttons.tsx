'use client';

import { AlertCircleIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OAUTH_PROVIDERS } from '@shipkit/shared/constants';
import { useOAuthPopup } from '@shipkit/shared/oauth-popup/react';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@shipkit/ui/components/alert';
import { Button } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { api, useUtils } from '@/lib/api/client';

import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';

import { useAuthRedirect } from './auth-redirect-context';

type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

// Providers whose default.svg is dark and vanishes on dark backgrounds
const INVERT_IN_DARK = new Set<OAuthProviderId>([]);

export function OAuthButtons() {
    const router = useRouter();
    const utils = useUtils();
    const redirectPath = useAuthRedirect();
    // @see [OAuth Popup Flow] Opens the OAuth login popup and listens for the success message from the callback page to complete the sign-in.
    const { openOAuthPopup, error } = useOAuthPopup();
    const [pendingProvider, setPendingProvider] =
        useState<OAuthProviderId | null>(null);

    const oauthSignInMutation = api.auth.oauth.signIn.useMutation();

    const handleOAuthClick = async (provider: OAuthProviderId) => {
        setPendingProvider(provider);

        const result = await openOAuthPopup(
            () =>
                oauthSignInMutation
                    .mutateAsync({
                        params: { provider },
                    })
                    .then((data) => data.body.url),
            { width: 600, height: 700 },
        );

        if (result.success) {
            void utils.auth.me.invalidateQuery();
            router.replace(redirectPath);
            router.refresh();
        } else {
            setPendingProvider(null);
        }
    };

    const oneAuthInProgress =
        oauthSignInMutation.isPending || !!pendingProvider;

    return (
        <div className="flex w-full flex-col space-y-3">
            {error && (
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>{error.title}</AlertTitle>
                    <AlertDescription>{error.description}</AlertDescription>
                </Alert>
            )}

            {Object.entries(OAUTH_PROVIDERS).map(([key, value]) => (
                <Button
                    key={key}
                    onClick={() => handleOAuthClick(value)}
                    disabled={oneAuthInProgress}
                    variant="outline"
                    className="w-full"
                >
                    {pendingProvider === value ? (
                        <Loader2 className="animate-spin" />
                    ) : (
                        <Image
                            src={`https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${value}/default.svg`}
                            alt=""
                            width={16}
                            height={16}
                            priority
                            className={cn(
                                'size-4',
                                INVERT_IN_DARK.has(value) && 'dark:invert',
                            )}
                            aria-hidden="true"
                        />
                    )}
                    <span>
                        {pendingProvider === value
                            ? `Connecting to ${key}...`
                            : `Continue with ${key}`}
                    </span>
                </Button>
            ))}
        </div>
    );
}
