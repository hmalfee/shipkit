import ChangeEmailCode from './templates/change-email-code';
import ChangeEmailNotice from './templates/change-email-notice';
import EmailSignIn from './templates/email-sign-in';

export const TEMPLATE_REGISTRY = {
    'email-sign-in': {
        component: EmailSignIn,
        subject: 'Sign in to your account',
    },
    'change-email-code': {
        component: ChangeEmailCode,
        subject: 'Your email change code',
    },
    'change-email-notice': {
        component: ChangeEmailNotice,
        subject: 'Your email address was changed',
    },
} as const;

export type TemplateName = keyof typeof TEMPLATE_REGISTRY;

export type TemplateProps<T extends TemplateName> = Parameters<
    (typeof TEMPLATE_REGISTRY)[T]['component']
>[0];
