'use client';

import { createContext, use } from 'react';

import type { Route } from 'next';

const AuthRedirectContext = createContext<Route | null>(null);

export function AuthRedirectProvider({
    redirect,
    children,
}: {
    redirect: Route;
    children: React.ReactNode;
}) {
    return (
        <AuthRedirectContext value={redirect}>{children}</AuthRedirectContext>
    );
}

export function useAuthRedirect(): Route {
    const redirect = use(AuthRedirectContext);
    if (!redirect) {
        throw new Error(
            'useAuthRedirect must be used within <AuthRedirectProvider>',
        );
    }
    return redirect;
}
