'use client';

import { useForm } from '@tanstack/react-form';
import { useState } from 'react';

import { Button } from '@mento-mark/ui/components/button';
import { Field, FieldError } from '@mento-mark/ui/components/field';
import { Input } from '@mento-mark/ui/components/input';

import { api, useUtils } from '@/lib/api/client';

function AddTodoForm() {
    const utils = useUtils();

    const create = api.todo.create.useMutation({
        onSuccess: () => void utils.todo.list.invalidateQuery(),
    });

    const form = useForm({
        defaultValues: { body: { title: '' } },
        validators: { onChange: api.todo.create.inputSchema },
        onSubmit: async ({ value }) => {
            create.mutate(value, {
                onSuccess: () => form.reset(),
            });
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
            }}
            className="flex gap-2"
        >
            <form.Field name="body.title">
                {(field) => (
                    <Field className="flex-1">
                        <Input
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            placeholder="Add a todo..."
                        />
                        <FieldError
                            errors={
                                field.state.meta.errors as Array<
                                    { message?: string } | undefined
                                >
                            }
                        />
                    </Field>
                )}
            </form.Field>
            <Button type="submit" disabled={create.isPending}>
                Add
            </Button>
        </form>
    );
}

export default function TodoList() {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const utils = useUtils();

    const { data, isLoading } = api.todo.list.useQuery();

    const update = api.todo.update.useMutation({
        onSuccess: () => {
            void utils.todo.list.invalidateQuery();
            setEditingId(null);
        },
    });

    const remove = api.todo.delete.useMutation({
        onSuccess: () => void utils.todo.list.invalidateQuery(),
    });

    function handleToggle(id: string, completed: boolean) {
        update.mutate({ params: { id }, body: { completed: !completed } });
    }

    function startEdit(id: string, title: string) {
        setEditingId(id);
        setEditTitle(title);
    }

    function handleEdit(id: string) {
        if (!editTitle.trim()) return;
        update.mutate({ params: { id }, body: { title: editTitle.trim() } });
    }

    const todos = data?.body ?? [];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Todos</h1>

            <AddTodoForm />

            {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
            ) : todos.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No todos yet. Add one above!
                </p>
            ) : (
                <ul className="divide-y">
                    {todos.map((todo) => (
                        <li
                            key={todo.id}
                            className="flex items-center gap-3 py-3"
                        >
                            <input
                                type="checkbox"
                                checked={todo.completed}
                                onChange={() =>
                                    handleToggle(todo.id, todo.completed)
                                }
                                className="size-4 shrink-0"
                            />

                            {editingId === todo.id ? (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleEdit(todo.id);
                                    }}
                                    className="flex flex-1 gap-2"
                                >
                                    <Input
                                        value={editTitle}
                                        onChange={(e) =>
                                            setEditTitle(e.target.value)
                                        }
                                        className="flex-1"
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={update.isPending}
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingId(null)}
                                    >
                                        Cancel
                                    </Button>
                                </form>
                            ) : (
                                <>
                                    <span
                                        className={`flex-1 ${todo.completed ? 'text-muted-foreground line-through' : ''}`}
                                    >
                                        {todo.title}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            startEdit(todo.id, todo.title)
                                        }
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() =>
                                            remove.mutate({
                                                params: { id: todo.id },
                                            })
                                        }
                                        disabled={remove.isPending}
                                    >
                                        Delete
                                    </Button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
