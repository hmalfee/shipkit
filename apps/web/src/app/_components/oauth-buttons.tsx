'use client';

import { useState } from 'react';

import { OAUTH_PROVIDERS } from '@mento-mark/shared/constants';

import { useOAuthPopup } from '@/hooks/use-oauth-popup';
import { api } from '@/lib/api/client';

import type { OAuthError } from '@/hooks/use-oauth-popup';
import type { OAUTH_PROVIDER_IDS } from '@mento-mark/shared/constants';

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
                <div className="rounded-md border border-red-200 bg-red-100 p-3 text-red-900">
                    <p className="font-semibold">
                        {oAuthError.error.message ?? 'Authentication error'}
                    </p>
                    <p className="text-sm">
                        {oAuthError.error.description ?? 'Please try again.'}
                    </p>
                </div>
            )}

            {Object.entries(OAUTH_PROVIDERS).map(([key, value]) => (
                <button
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
                    className="flex items-center justify-center gap-2 rounded-md border p-2 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                    <span>
                        {pendingProvider === value
                            ? 'Connecting...'
                            : `Continue with ${key}`}
                    </span>
                </button>
            ))}
        </div>
    );
}
