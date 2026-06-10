'use client';

import { api } from '@/lib/api/client';

import AuthForm from './auth-form';
import TodoList from './todo-list';

export default function PageContent() {
    const { data, isPending } = api.auth.me.useQuery();

    if (isPending) {
        return (
            <p className="text-muted-foreground text-center text-sm">
                Loading...
            </p>
        );
    }

    const user = data?.body;

    if (!user) {
        return <AuthForm />;
    }

    return <TodoList />;
}
