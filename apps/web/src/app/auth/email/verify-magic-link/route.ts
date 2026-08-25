import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { env } from '@/env';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');
    const callbackUrl = request.nextUrl.searchParams.get('callbackURL');

    const host =
        request.headers.get('x-forwarded-host') ??
        request.headers.get('host') ??
        request.nextUrl.host;
    const protocol =
        request.headers.get('x-forwarded-proto') ??
        request.nextUrl.protocol.replace(':', '');
    const origin = `${protocol}://${host}`;

    if (!token) {
        return redirect('/?error=invalid_token');
    }

    const apiUrl = new URL(
        `${env.INTERNAL_SERVER_URL}/auth/email/verify-magic-link`,
    );
    apiUrl.searchParams.set('token', token);
    if (callbackUrl) apiUrl.searchParams.set('callbackURL', callbackUrl);

    const response = await fetch(apiUrl, {
        redirect: 'manual',
        headers: {
            cookie: request.headers.get('cookie') ?? '',
            origin: origin,
        },
    });

    const location = response.headers.get('location') ?? '/';
    const redirectTarget = new URL(location, origin);

    const redirectResponse = NextResponse.redirect(redirectTarget);
    for (const cookie of response.headers.getSetCookie()) {
        redirectResponse.headers.append('set-cookie', cookie);
    }

    return redirectResponse;
}
