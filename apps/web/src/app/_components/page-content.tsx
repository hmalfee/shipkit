'use client';

import { api } from '@/lib/api/client';

import AuthForm from './auth-form';
import TodoList from './todo-list';

export default function PageContent() {
    const { data, isLoading } = api.auth.me.useQuery();

    if (isLoading) {
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
