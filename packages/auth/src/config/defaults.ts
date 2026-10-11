import type { AuthConfig, ChangeEmailConfig, OtpConfig } from './types';

/**
 * Every default the auth SDK applies when the host app doesn't provide a value.
 * This is the single place to look (and edit) to see what you get out of the box.
 */
const DEFAULT_OTP_CONFIG: Readonly<OtpConfig> = {
    length: 6,
    resendCooldownSeconds: 30,
    expiresInMinutes: 10,
    allowedAttempts: 3,
};

const DEFAULT_CHANGE_EMAIL_CONFIG: Readonly<ChangeEmailConfig> = {
    maxVerificationSends: 3,
};

function withDefaults<T extends object>(
    defaults: Readonly<T>,
    overrides?: Partial<T>,
): T {
    const result: T = { ...defaults };
    for (const key of Object.keys(overrides ?? {}) as Array<keyof T>) {
        const value = overrides?.[key];
        if (value !== undefined) result[key] = value as T[keyof T];
    }
    return result;
}

/** Fully-resolved config the plugins consume (nothing optional). */
export function resolveAuthDefaults(config: AuthConfig) {
    return {
        otp: withDefaults(DEFAULT_OTP_CONFIG, config.otp),
        changeEmail: withDefaults(
            DEFAULT_CHANGE_EMAIL_CONFIG,
            config.changeEmail,
        ),
    };
}
