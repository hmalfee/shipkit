'use client';

import { Separator } from '@shipkit/ui/components/separator';

import { api } from '@/lib/api/client';

import { AvatarSection } from './_components/avatar-section';
import { ChangeEmailSection } from './_components/change-email-section';
import { PersonalInfoSection } from './_components/personal-info-section';

export default function ProfilePage() {
    const { data, isPending } = api.auth.me.useQuery();
    const user = data?.body;

    if (isPending || !user) {
        return (
            <div className="container mx-auto max-w-md px-4 py-8">
                <p className="text-muted-foreground text-center text-sm">
                    Loading...
                </p>
            </div>
        );
    }

    return (
        <div className="container mx-auto flex max-w-md flex-col gap-8 px-4 py-8">
            <header>
                <h1 className="text-2xl font-bold">Your profile</h1>
                <p className="text-muted-foreground text-sm">
                    Manage your avatar, personal info, and email address.
                </p>
            </header>

            <div className="flex flex-col gap-8">
                <AvatarSection name={user.name} image={user.image} />
                <Separator />
                <PersonalInfoSection name={user.name} />
                <Separator />
                <ChangeEmailSection
                    email={user.email}
                    status={user.changeEmailStatus}
                />
            </div>
        </div>
    );
}
