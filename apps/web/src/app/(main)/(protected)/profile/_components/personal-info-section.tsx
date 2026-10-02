'use client';

import { revalidateLogic, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';

import { Button } from '@shipkit/ui/components/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@shipkit/ui/components/field';
import { Input } from '@shipkit/ui/components/input';

import { api, useUtils } from '@/lib/api/client';

import { SectionWrapper } from './section-wrapper';

type FieldErrors = Array<{ message?: string } | undefined>;

export function PersonalInfoSection({ name }: { name: string }) {
    const utils = useUtils();
    const { useMutation, inputSchema } = api.auth.updateProfile;

    const update = useMutation({
        onSuccess: async () => {
            toast.success('Profile updated');
            await utils.auth.me.invalidateQuery();
        },
    });

    const form = useForm({
        defaultValues: { body: { name } },
        validationLogic: revalidateLogic({
            mode: 'submit',
            modeAfterSubmission: 'change',
        }),
        validators: { onDynamic: inputSchema },
        onSubmit: ({ value, formApi }) =>
            update.mutate(value, { onSuccess: () => formApi.reset(value) }),
    });

    return (
        <SectionWrapper
            title="Personal info"
            description="Your name and other details you can change anytime."
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void form.handleSubmit();
                }}
            >
                <FieldGroup>
                    <form.Field name="body.name">
                        {(field) => {
                            const errors = field.state.meta
                                .errors as FieldErrors;
                            return (
                                <Field data-invalid={errors.length > 0}>
                                    <FieldLabel htmlFor={field.name}>
                                        Name
                                    </FieldLabel>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onChange={(e) =>
                                            field.handleChange(e.target.value)
                                        }
                                        onBlur={field.handleBlur}
                                    />
                                    {errors.length > 0 && (
                                        <FieldError errors={errors} />
                                    )}
                                </Field>
                            );
                        }}
                    </form.Field>
                    <form.Subscribe
                        selector={(s) =>
                            [s.canSubmit, s.isDefaultValue] as const
                        }
                    >
                        {([canSubmit, isDefaultValue]) => (
                            <div className="mt-2 flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={
                                        !canSubmit ||
                                        isDefaultValue ||
                                        update.isPending
                                    }
                                >
                                    {update.isPending
                                        ? 'Saving...'
                                        : 'Save changes'}
                                </Button>
                            </div>
                        )}
                    </form.Subscribe>
                </FieldGroup>
            </form>
        </SectionWrapper>
    );
}
