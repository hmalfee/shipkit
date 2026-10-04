'use client';

import { AlertCircleIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { OAUTH_PROVIDERS } from '@shipkit/shared/constants';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@shipkit/ui/components/alert';
import { Button } from '@shipkit/ui/components/button';
import { cn } from '@shipkit/ui/lib/utils';

import { useOAuthPopup } from '@/hooks/use-oauth-popup';
import { api } from '@/lib/api/client';

import type { OAuthError } from '@/hooks/use-oauth-popup';
import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';
import type { Route } from 'next';

type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

// Providers whose default.svg is dark and vanishes on dark backgrounds
const INVERT_IN_DARK = new Set<OAuthProviderId>([]);

export function OAuthButtons() {
    const { openOAuthPopup } = useOAuthPopup();
    const [oAuthError, setOAuthError] = useState<OAuthError | null>(null);
    const [pendingProvider, setPendingProvider] =
        useState<OAuthProviderId | null>(null);

    const oauthSignInMutation = api.auth.oauth.signIn.useMutation({
        onError: (error) => {
            setOAuthError({
                success: false,
                error: {
                    message: error.message,
                    description: 'Failed to initiate OAuth',
                },
            });
            setPendingProvider(null);
        },
    });

    const handleOAuthClick = async (provider: OAuthProviderId) => {
        setOAuthError(null);
        setPendingProvider(provider);

        const result = await openOAuthPopup(
            () =>
                oauthSignInMutation
                    .mutateAsync({
                        params: { provider },
                        body: {
                            callbackURL:
                                '/auth/callback/success' satisfies Route,
                        },
                    })
                    .then((data) => data.body.url),
            { width: 600, height: 700 },
        );

        if (result.success) {
            window.location.reload();
        } else {
            setOAuthError(result);
            setPendingProvider(null);
        }
    };

    const oneAuthInProgress =
        oauthSignInMutation.isPending || !!pendingProvider;

    return (
        <div className="flex w-full flex-col space-y-3">
            {oAuthError && (
                <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>
                        {oAuthError.error.message ?? 'Authentication error'}
                    </AlertTitle>
                    <AlertDescription>
                        {oAuthError.error.description ?? 'Please try again.'}
                    </AlertDescription>
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
