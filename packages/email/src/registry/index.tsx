import SignInLink from './templates/sign-in-link';
import VerifyEmail from './templates/verify-email';

export const TEMPLATE_REGISTRY = {
    'sign-in-link': {
        component: SignInLink,
        subject: 'Sign in to your account',
    },
    'verify-email': {
        component: VerifyEmail,
        subject: 'Verify your email address',
    },
} as const;

export type TemplateName = keyof typeof TEMPLATE_REGISTRY;

export type TemplateProps<T extends TemplateName> = Parameters<
    (typeof TEMPLATE_REGISTRY)[T]['component']
>[0];
