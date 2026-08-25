import EmailSignIn from './templates/email-sign-in';

export const TEMPLATE_REGISTRY = {
    'email-sign-in': {
        component: EmailSignIn,
        subject: 'Sign in to your account',
    },
} as const;

export type TemplateName = keyof typeof TEMPLATE_REGISTRY;

export type TemplateProps<T extends TemplateName> = Parameters<
    (typeof TEMPLATE_REGISTRY)[T]['component']
>[0];
