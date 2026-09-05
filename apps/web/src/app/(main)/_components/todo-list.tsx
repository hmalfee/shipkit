'use client';

import { useForm } from '@tanstack/react-form';
import { useState } from 'react';

import { Button } from '@shipkit/ui/components/button';
import { Field, FieldError } from '@shipkit/ui/components/field';
import { Input } from '@shipkit/ui/components/input';

import { api, useUtils } from '@/lib/api/client';

function AddTodoForm() {
    const utils = useUtils();

    const { useMutation, inputSchema } = api.todo.create;

    const create = useMutation({
        onSuccess: () => utils.todo.list.invalidateQuery(),
    });

    const form = useForm({
        defaultValues: { body: { title: '' } },
        validators: {
            onChange: inputSchema,
        },
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
            <form.Subscribe
                selector={(state) => ({
                    canSubmit: state.canSubmit,
                    isPending: create.isPending,
                })}
            >
                {({ canSubmit, isPending }) => (
                    <>
                        <form.Field name="body.title">
                            {(field) => (
                                <Field className="flex-1">
                                    <Input
                                        value={field.state.value}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
                                        placeholder="Add a todo..."
                                    />
                                    {field.state.meta.isTouched &&
                                        field.state.meta.errors.length > 0 && (
                                            <FieldError
                                                errors={
                                                    field.state.meta
                                                        .errors as Array<
                                                        | { message?: string }
                                                        | undefined
                                                    >
                                                }
                                            />
                                        )}
                                </Field>
                            )}
                        </form.Field>
                        <Button
                            type="submit"
                            disabled={!canSubmit || isPending}
                        >
                            Add
                        </Button>
                    </>
                )}
            </form.Subscribe>
        </form>
    );
}

type Todo = { id: string; title: string; completed: boolean };

function TodoItem({
    todo,
    onMutate,
}: {
    todo: Todo;
    onMutate: () => Promise<void>;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');

    const { useMutation: useUpdate } = api.todo.update;
    const { useMutation: useDelete } = api.todo.delete;

    const update = useUpdate({
        onSuccess: async () => {
            await onMutate();
            setIsEditing(false);
        },
    });
    const remove = useDelete({ onSuccess: async () => await onMutate() });

    const isBusy = update.isPending || remove.isPending;

    function handleToggle() {
        update.mutate({
            params: { id: todo.id },
            body: { completed: !todo.completed },
        });
    }

    function startEdit() {
        setIsEditing(true);
        setEditTitle(todo.title);
    }

    function handleEdit(e: React.FormEvent) {
        e.preventDefault();
        if (!editTitle.trim()) return;
        update.mutate({
            params: { id: todo.id },
            body: { title: editTitle.trim() },
        });
    }

    return (
        <li className="flex items-center gap-3 py-3">
            <input
                type="checkbox"
                checked={todo.completed}
                onChange={handleToggle}
                disabled={isBusy}
                className="size-4 shrink-0"
            />

            {isEditing ? (
                <form onSubmit={handleEdit} className="flex flex-1 gap-2">
                    <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1"
                    />
                    <Button type="submit" size="sm" disabled={update.isPending}>
                        Save
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                        disabled={update.isPending}
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
                        onClick={startEdit}
                        disabled={isBusy}
                    >
                        Edit
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                            remove.mutate({ params: { id: todo.id } })
                        }
                        disabled={remove.isPending}
                    >
                        Delete
                    </Button>
                </>
            )}
        </li>
    );
}

export default function TodoList() {
    const utils = useUtils();
    const { useQuery } = api.todo.list;
    const { data, isLoading } = useQuery();
    const todos = data?.body ?? [];
    const invalidate = () => utils.todo.list.invalidateQuery();

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
                        <TodoItem
                            key={todo.id}
                            todo={todo}
                            onMutate={invalidate}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
