'use client';

import { api } from '@/lib/api/client';

import AuthForm from './_components/auth-form';
import TodoList from './_components/todo-list';

export default function Home() {
    const { data, isPending } = api.auth.me.useQuery();

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8">
            {isPending ? (
                <p className="text-muted-foreground text-center text-sm">
                    Loading...
                </p>
            ) : data?.body ? (
                <TodoList />
            ) : (
                <AuthForm />
            )}
        </div>
    );
}
