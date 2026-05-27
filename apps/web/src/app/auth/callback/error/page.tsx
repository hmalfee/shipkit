'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useOAuthPopup } from '@/hooks/use-oauth-popup';

function OAuthErrorContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error') ?? 'Authentication failed';
    const errorDescription = searchParams.get('error_description') ?? '';

    const { sendResponse } = useOAuthPopup();

    useEffect(() => {
        sendResponse({
            success: false,
            error: {
                message: error,
                description: errorDescription,
            },
        });
    }, [error, errorDescription, sendResponse]);

    return null;
}

export default function OAuthErrorPage() {
    return (
        <Suspense fallback={null}>
            <OAuthErrorContent />
        </Suspense>
    );
}
