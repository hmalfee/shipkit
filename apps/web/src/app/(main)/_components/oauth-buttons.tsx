'use client';

import { AlertCircleIcon } from 'lucide-react';
import { useState } from 'react';

import { OAUTH_PROVIDERS } from '@shipkit/shared/constants';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@shipkit/ui/components/alert';
import { Button } from '@shipkit/ui/components/button';

import { useOAuthPopup } from '@/hooks/use-oauth-popup';
import { api } from '@/lib/api/client';

import type { OAuthError } from '@/hooks/use-oauth-popup';
import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';

export function OAuthButtons() {
    const { openOAuthPopup } = useOAuthPopup();
    const [oAuthError, setOAuthError] = useState<OAuthError | null>(null);
    const [pendingProvider, setPendingProvider] = useState<
        (typeof OAUTH_PROVIDER_IDS)[number] | null
    >(null);

    const oauthSignInMutation = api.auth.oauthSignIn.useMutation({
        onSuccess: async (data) => {
            const result = await openOAuthPopup(data.body.url, {
                width: 600,
                height: 700,
            });
            if (result.success) {
                // Assuming successful login redirects to '/' or reloading the page
                window.location.reload();
            } else {
                setOAuthError(result);
                setPendingProvider(null);
            }
        },
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

    const oneAuthInProgress = oauthSignInMutation.isPending;

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
                    onClick={() => {
                        setOAuthError(null);
                        setPendingProvider(value);
                        oauthSignInMutation.mutate({
                            params: {
                                provider: value,
                            },
                            body: {
                                callbackURL: `${window.location.origin}/auth/callback/success`,
                            },
                        });
                    }}
                    disabled={oneAuthInProgress}
                    variant="outline"
                >
                    <span>
                        {pendingProvider === value
                            ? 'Connecting...'
                            : `Continue with ${key}`}
                    </span>
                </Button>
            ))}
        </div>
    );
}
