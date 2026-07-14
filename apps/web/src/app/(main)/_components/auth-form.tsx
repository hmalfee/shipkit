'use client';

import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@shipkit/ui/components/button';
import { Field, FieldError, FieldLabel } from '@shipkit/ui/components/field';
import { Input } from '@shipkit/ui/components/input';

import { api, useUtils } from '@/lib/api/client';

import { OAuthButtons } from './oauth-buttons';

function SignInForm() {
    const { useMutation, inputSchema } = api.auth.signIn;
    const utils = useUtils();

    const signIn = useMutation({
        onSuccess: (data) => {
            void utils.auth.me.invalidateQuery();
            toast.success(
                'Welcome back, ' + data.body.name.split(' ')[0] + '!',
            );
        },
    });

    const form = useForm({
        defaultValues: { body: { email: '', password: '' } },
        validators: { onChange: inputSchema },
        onSubmit: async ({ value }) => {
            signIn.mutate(value);
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
            }}
            className="space-y-4"
        >
            <form.Field name="body.email">
                {(field) => (
                    <Field
                        data-invalid={
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                        }
                    >
                        <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                        <Input
                            id={field.name}
                            type="email"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
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

            <form.Field name="body.password">
                {(field) => (
                    <Field
                        data-invalid={
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                        }
                    >
                        <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                        <Input
                            id={field.name}
                            type="password"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
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

            <Button
                type="submit"
                className="w-full"
                disabled={signIn.isPending}
            >
                {signIn.isPending ? 'Loading...' : 'Sign In'}
            </Button>
        </form>
    );
}

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
    const { useMutation, inputSchema } = api.auth.signUp;

    const signUp = useMutation({
        onSuccess: () => {
            form.reset();
            onSuccess();
            toast.success('Account created! Please sign in.');
        },
    });

    const form = useForm({
        defaultValues: { body: { name: '', email: '', password: '' } },
        validators: { onChange: inputSchema },
        onSubmit: async ({ value }) => {
            signUp.mutate(value);
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
            }}
            className="space-y-4"
        >
            <form.Field name="body.name">
                {(field) => (
                    <Field
                        data-invalid={
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                        }
                    >
                        <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                        <Input
                            id={field.name}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
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

            <form.Field name="body.email">
                {(field) => (
                    <Field
                        data-invalid={
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                        }
                    >
                        <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                        <Input
                            id={field.name}
                            type="email"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
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

            <form.Field name="body.password">
                {(field) => (
                    <Field
                        data-invalid={
                            field.state.meta.isTouched &&
                            !field.state.meta.isValid
                        }
                    >
                        <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                        <Input
                            id={field.name}
                            type="password"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
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

            <Button
                type="submit"
                className="w-full"
                disabled={signUp.isPending}
            >
                {signUp.isPending ? 'Loading...' : 'Sign Up'}
            </Button>
        </form>
    );
}

export default function AuthForm() {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');

    return (
        <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="text-center">
                <h1 className="text-2xl font-bold">
                    {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </h1>
                <p className="text-muted-foreground text-sm">
                    {mode === 'signin'
                        ? 'Enter your credentials to continue'
                        : 'Create a new account'}
                </p>
            </div>

            {mode === 'signin' ? (
                <SignInForm />
            ) : (
                <SignUpForm onSuccess={() => setMode('signin')} />
            )}

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background text-muted-foreground px-2">
                        Or continue with
                    </span>
                </div>
            </div>

            <OAuthButtons />

            <p className="text-center text-sm">
                {mode === 'signin' ? (
                    <>
                        No account?{' '}
                        <button
                            type="button"
                            className="underline"
                            onClick={() => setMode('signup')}
                        >
                            Sign up
                        </button>
                    </>
                ) : (
                    <>
                        Have an account?{' '}
                        <button
                            type="button"
                            className="underline"
                            onClick={() => setMode('signin')}
                        >
                            Sign in
                        </button>
                    </>
                )}
            </p>
        </div>
    );
}
