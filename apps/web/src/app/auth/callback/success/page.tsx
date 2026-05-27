'use client';

import { useEffect } from 'react';

import { useOAuthPopup } from '@/hooks/use-oauth-popup';

export default function OAuthSuccessPage() {
    const { sendResponse } = useOAuthPopup();

    useEffect(() => {
        sendResponse({
            success: true,
            data: null,
        });
    }, [sendResponse]);

    return null;
}
