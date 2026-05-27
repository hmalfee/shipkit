import { notFound } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PopupWindowOptions {
    width?: number;
    height?: number;
    top?: number;
    left?: number;
}

interface OAuthResult<T = unknown> {
    success: true;
    data: T;
}

export interface OAuthError {
    success: false;
    error: {
        message: string;
        description?: string;
    };
}

type OAuthResponse<T = unknown> = OAuthResult<T> | OAuthError;

export function useOAuthPopup<T = unknown>() {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const popupRef = useRef<Window | null>(null);
    const promiseRef = useRef<{
        resolve: (value: OAuthResponse<T>) => void;
    } | null>(null);

    // Listen for OAuth result messages from popup
    useEffect(() => {
        const handleMessage = (event: MessageEvent<unknown>) => {
            // Security: validate origin
            if (event.origin !== window.location.origin) return;

            const data = event.data as OAuthResponse<T> & { type?: string };

            if (data?.type === 'OAUTH_RESPONSE') {
                promiseRef.current?.resolve(data);
                setIsPopupOpen(false);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Detect manual popup closure
    useEffect(() => {
        if (!isPopupOpen) return;

        const interval = setInterval(() => {
            if (popupRef.current?.closed) {
                promiseRef.current?.resolve({
                    success: false,
                    error: {
                        message: 'Authentication cancelled',
                        description: 'The OAuth popup was closed by the user',
                    },
                });
                setIsPopupOpen(false);
            }
        }, 500);

        return () => clearInterval(interval);
    }, [isPopupOpen]);

    const openOAuthPopup = useCallback(
        (
            url: string,
            options?: PopupWindowOptions,
        ): Promise<OAuthResponse<T>> => {
            return new Promise((resolve) => {
                const width = options?.width ?? 600;
                const height = options?.height ?? 700;
                const top =
                    options?.top ??
                    Math.round((window.innerHeight - height) / 2);
                const left =
                    options?.left ??
                    Math.round((window.innerWidth - width) / 2);

                const features = [
                    `width=${width}`,
                    `height=${height}`,
                    `top=${top}`,
                    `left=${left}`,
                    'toolbar=no',
                    'menubar=no',
                    'scrollbars=yes',
                    'resizable=yes',
                ].join(',');

                promiseRef.current = { resolve };

                const popup = window.open(url, 'oauth_popup', features);

                if (!popup) {
                    resolve({
                        success: false,
                        error: {
                            message: 'Failed to open authentication popup',
                            description:
                                'The popup window could not be opened. This may be blocked by your browser. Please check your popup blocker settings.',
                        },
                    });
                    return;
                }

                popupRef.current = popup;
                setIsPopupOpen(true);
            });
        },
        [],
    );

    const closeOAuthPopup = useCallback(() => {
        popupRef.current?.close();
        setIsPopupOpen(false);
    }, []);

    // For use in popup/callback pages
    const sendResponse = useCallback((response: OAuthResponse<T>) => {
        if (!window.opener) {
            return notFound();
        }

        const opener = window.opener as Window;
        opener.postMessage(
            { type: 'OAUTH_RESPONSE', ...response },
            window.location.origin,
        );
        window.close();
    }, []);

    return {
        isPopupOpen,
        openOAuthPopup,
        closeOAuthPopup,
        sendResponse,
    };
}
