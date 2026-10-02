'use client';

import { LogOutIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
            router.push('/auth');
        },
    });

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
                                    onClick={() => signOut.mutate(undefined)}
                                    disabled={signOut.isPending}
                                >
                                    <LogOutIcon />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <ModeToggle />
                </div>
            </div>
            <hr />
        </div>
    );
}
