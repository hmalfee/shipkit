'use client';

import { LogOutIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@shipkit/ui/components/alert-dialog';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from '@shipkit/ui/components/avatar';
import { Button } from '@shipkit/ui/components/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@shipkit/ui/components/dropdown-menu';

import { api, useUtils } from '@/lib/api/client';
import { getInitials } from '@/lib/utils';

import { ModeToggle } from './mode-toggle';

export default function Header() {
    const { data } = api.auth.me.useQuery();
    const utils = useUtils();
    const router = useRouter();
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [isNavigating, startNavigation] = useTransition();

    const signOut = api.auth.signOut.useMutation({
        onSuccess: () => {
            toast.success('Signed out');
            void utils.auth.me.invalidateQuery();
            // isNavigating stays true until the new route commits, and the
            // close below commits together with it
            startNavigation(() => {
                router.push('/auth');
                setLogoutOpen(false);
            });
        },
        onError: () => {
            toast.error('Failed to sign out. Please try again.');
        },
    });

    const isSigningOut = signOut.isPending || isNavigating;

    const user = data?.body;

    return (
        <div>
            <div className="flex flex-row items-center justify-between px-2 py-1">
                <nav className="flex gap-4 text-lg">
                    <Link href={'/'}>Home</Link>
                </nav>
                <div className="flex items-center gap-2">
                    {user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-full"
                                    />
                                }
                            >
                                <Avatar className="size-7">
                                    <AvatarImage
                                        src={user.image ?? undefined}
                                        alt={user.name}
                                    />
                                    <AvatarFallback className="text-xs">
                                        {getInitials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="sr-only">
                                    Open account menu
                                </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                    <DropdownMenuLabel>
                                        {user.name}
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                        render={<Link href={'/profile'} />}
                                    >
                                        <UserIcon />
                                        Profile
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setLogoutOpen(true)}
                                >
                                    <LogOutIcon />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {/* Outside `user &&` so the refetched null user doesn't unmount it mid-logout */}
                    <AlertDialog
                        open={logoutOpen}
                        onOpenChange={(open) => {
                            if (!isSigningOut) setLogoutOpen(open);
                        }}
                    >
                        <AlertDialogContent size="sm">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Log out?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    You&apos;ll need to sign in again to access
                                    your account.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSigningOut}>
                                    Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    variant="destructive"
                                    onClick={() => signOut.mutate(undefined)}
                                    disabled={isSigningOut}
                                >
                                    {isSigningOut ? 'Logging out…' : 'Logout'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <ModeToggle />
                </div>
            </div>
            <hr />
        </div>
    );
}
