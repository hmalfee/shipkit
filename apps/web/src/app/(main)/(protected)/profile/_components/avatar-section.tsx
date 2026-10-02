'use client';

import { PencilIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
    Avatar,
    AvatarBadge,
    AvatarFallback,
    AvatarImage,
} from '@shipkit/ui/components/avatar';
import { Button } from '@shipkit/ui/components/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@shipkit/ui/components/dropdown-menu';

import { getInitials } from '@/lib/utils';

import { SectionWrapper } from './section-wrapper';

export function AvatarSection({
    name,
    image,
}: {
    name: string;
    image: string | null;
}) {
    // TODO: replace stubs once the avatar API exists
    const onUpload = () => toast.info('Avatar uploads are coming soon');
    const onRemove = () => toast.info('Avatar deletion is coming soon');

    const pencilButtonProps = {
        type: 'button',
        variant: 'secondary',
        size: 'icon-xs',
        'aria-label': 'Change avatar',
        className: 'border-primary rounded-full',
    } as const;

    return (
        <SectionWrapper
            title="Avatar"
            description="Your profile picture, shown across the app."
        >
            <div className="flex justify-center py-4">
                <Avatar className="size-24 shadow-sm">
                    <AvatarImage src={image ?? undefined} alt={name} />
                    <AvatarFallback className="text-2xl">
                        {getInitials(name)}
                    </AvatarFallback>
                    <AvatarBadge className="size-auto! bg-transparent opacity-70 ring-0">
                        {image ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={<Button {...pencilButtonProps} />}
                                >
                                    <PencilIcon />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={onUpload}>
                                        <UploadIcon />
                                        Change photo
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={onRemove}
                                    >
                                        <Trash2Icon />
                                        Remove photo
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button {...pencilButtonProps} onClick={onUpload}>
                                <PencilIcon />
                            </Button>
                        )}
                    </AvatarBadge>
                </Avatar>
            </div>
        </SectionWrapper>
    );
}
