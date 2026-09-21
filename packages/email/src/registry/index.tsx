import ChangeEmailVerification from './templates/change-email-verification';
import EmailSignIn from './templates/email-sign-in';

export const TEMPLATE_REGISTRY = {
    'email-sign-in': {
        component: EmailSignIn,
        subject: 'Sign in to your account',
    },
    'change-email-verification': {
        component: ChangeEmailVerification,
        subject: 'Verify your new email address',
    },
} as const;

export type TemplateName = keyof typeof TEMPLATE_REGISTRY;

export type TemplateProps<T extends TemplateName> = Parameters<
    (typeof TEMPLATE_REGISTRY)[T]['component']
>[0];
