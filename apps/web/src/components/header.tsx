'use client';

import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@shipkit/ui/components/button';

import { api, useUtils } from '@/lib/api/client';

import { ModeToggle } from './mode-toggle';

export default function Header() {
    const { data } = api.auth.me.useQuery();
    const utils = useUtils();

    const signOut = api.auth.signOut.useMutation({
        onSuccess: () => {
            // Optimistically update the cache to rerender the signed out state of the user,
            // and re-validate in the background to sync with server true state
            utils.auth.me.setQueryData({
                status: 200,
                body: null,
            });
            toast.success('Signed out');
            void utils.auth.me.invalidateQuery();
        },
    });

    const user = data?.body;

    return (
        <div>
            <div className="flex flex-row items-center justify-between px-2 py-1">
                <nav className="flex gap-4 text-lg">
                    <Link href="/">Home</Link>
                </nav>
                <div className="flex items-center gap-2">
                    {user && (
                        <>
                            <span className="text-muted-foreground text-sm">
                                {user.name}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => signOut.mutate(undefined)}
                                disabled={signOut.isPending}
                            >
                                Sign out
                            </Button>
                        </>
                    )}
                    <ModeToggle />
                </div>
            </div>
            <hr />
        </div>
    );
}
