import { redirect } from 'next/navigation';

import { rpc } from '@/lib/api/rpc';
import { REDIRECT_PARAM } from '@/lib/constants';
import { sanitizeRedirect } from '@/lib/utils';

import AuthForm from './_components/auth-form';
import { AuthRedirectProvider } from './_components/auth-redirect-context';

export default async function AuthPage({
    searchParams,
}: {
    searchParams: Promise<{ [REDIRECT_PARAM]?: string | string[] }>;
}) {
    const { [REDIRECT_PARAM]: redirectParam } = await searchParams;
    const redirectPath = sanitizeRedirect(redirectParam);

    // Already signed in? Skip the form. This also fires after a successful
    // OAuth popup flow, since the opener reloads this same `/auth?next=...`
    // URL once the popup posts back a success message.
    const user = await rpc.auth.me();
    if (user.body) {
        redirect(redirectPath);
    }

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8">
            <AuthRedirectProvider redirect={redirectPath}>
                <AuthForm />
            </AuthRedirectProvider>
        </div>
    );
}
