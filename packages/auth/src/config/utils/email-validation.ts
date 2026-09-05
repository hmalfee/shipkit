import { BASE_ERROR_CODES } from 'better-auth';
import { APIError } from 'better-auth/api';
import MailChecker from 'mailchecker';
import validatorNormalizeEmail from 'validator/lib/normalizeEmail';

import type { GenericEndpointContext } from 'better-auth';

// mac.com/me.com are frozen iCloud domains (unassignable as a *new* primary
// since 2012) that always point to an existing icloud.com inbox, so merging
// them is safe
const ICLOUD_LEGACY_ALIASES: Record<string, string> = {
    'mac.com': 'icloud.com',
    'me.com': 'icloud.com',
};

// Providers validator doesn't know about; strip "+tag" for them ourselves.
const CUSTOM_PLUS_TAG_DOMAINS = new Set([
    'fastmail.com',
    'fastmail.fm',
    'protonmail.com',
    'proton.me',
    'pm.me',
]);

const PLUS_TAG_REGEX = /\+.*$/;
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF]/g;

export function sanitizeEmail(raw: string): string {
    return raw.trim().toLowerCase().replace(INVISIBLE_CHARS_REGEX, '');
}

/**
 * Strips "+tag" for CUSTOM_PLUS_TAG_DOMAINS; falls back to input if
 * that would empty the local part.
 */
function stripCustomPlusTag(sanitizedEmail: string): string {
    const atIndex = sanitizedEmail.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === sanitizedEmail.length - 1) {
        return sanitizedEmail;
    }

    const domain = sanitizedEmail.slice(atIndex + 1);
    if (!CUSTOM_PLUS_TAG_DOMAINS.has(domain)) {
        return sanitizedEmail;
    }

    const local = sanitizedEmail.slice(0, atIndex).replace(PLUS_TAG_REGEX, '');
    if (local.length === 0) {
        return sanitizedEmail;
    }

    return `${local}@${domain}`;
}

/**
 * Normalizes a pre-sanitized email (see sanitizeEmail) via
 * validator.js, plus our iCloud alias and custom +tag domains.
 */
export function normalizeEmail(sanitizedEmail: string): string {
    const atIndex = sanitizedEmail.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === sanitizedEmail.length - 1) {
        // validator.js mishandles a missing/trailing "@" (e.g. turns
        // "noatsign" into "@noatsign").
        return sanitizedEmail;
    }

    const domain = sanitizedEmail.slice(atIndex + 1);
    const aliasedDomain = ICLOUD_LEGACY_ALIASES[domain];
    const emailForValidator = aliasedDomain
        ? `${sanitizedEmail.slice(0, atIndex)}@${aliasedDomain}`
        : sanitizedEmail;

    const validated = validatorNormalizeEmail(emailForValidator, {
        // we already lowercased in sanitizeEmail()
        all_lowercase: false,
        gmail_lowercase: false,
        outlookdotcom_lowercase: false,
        yahoo_lowercase: false,
        yandex_lowercase: false,
        icloud_lowercase: false,

        gmail_remove_dots: true,
        gmail_remove_subaddress: true,
        gmail_convert_googlemaildotcom: true,
        outlookdotcom_remove_subaddress: true,
        yahoo_remove_subaddress: true,
        yandex_convert_yandexru: true,
        icloud_remove_subaddress: true,
    });

    // validator.js returns `false` (not the original string) when +tag
    // stripping would empty the local part.
    const normalized = validated === false ? sanitizedEmail : validated;

    return stripCustomPlusTag(normalized);
}

const DISPOSABLE_DOMAINS_URL =
    'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt';

let customDomainsLoaded: Promise<void> | null = null;

/**
 * Fetches the extra disposable-domain list into MailChecker once per
 * process; a failed fetch isn't cached, so it retries next call.
 */
async function ensureCustomDisposableDomainsLoaded(): Promise<void> {
    customDomainsLoaded ??= (async () => {
        const response = await fetch(DISPOSABLE_DOMAINS_URL);
        if (!response.ok) {
            throw new Error(
                `Failed to fetch disposable domain list (${response.status} ${response.statusText})`,
            );
        }
        const text = await response.text();
        const domains = text
            .split(/\r?\n/)
            .map((line) => line.trim().toLowerCase())
            .filter((line) => line.length > 0 && !line.startsWith('#'));
        MailChecker.addCustomDomains(domains);
    })().catch((err) => {
        customDomainsLoaded = null;
        throw err;
    });

    try {
        await customDomainsLoaded;
    } catch {
        // Fail open: don't block signups just because the list
        // fetch failed.
    }
}

/**
 * Rejects disposable/temporary emails, with a bypass for existing users
 * registered before the domain was blocklisted
 *
 * @param originalEmail The sanitized email result from `sanitizeEmail`.
 * @param normalizedEmail The normalized email result from `normalizeEmail`.
 * @param internalAdapter The internal adapter for database operations.
 */
export async function assertNotDisposable(
    originalEmail: string,
    normalizedEmail: string,
    internalAdapter: GenericEndpointContext['context']['internalAdapter'],
): Promise<void> {
    await ensureCustomDisposableDomainsLoaded();

    if (MailChecker.isValid(originalEmail)) return;

    // normalizedEmail is what's stored in the DB, so look up by that,
    // not originalEmail.
    const existing = await internalAdapter.findUserByEmail(normalizedEmail);

    if (!existing) {
        throw new APIError('BAD_REQUEST', {
            message:
                "Temporary or disposable email addresses aren't allowed. Please use a permanent email address.",
            code: BASE_ERROR_CODES.INVALID_EMAIL.code,
        });
    }
}
