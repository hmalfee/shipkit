import { APIError as AuthError } from 'better-auth';

import type { BASE_ERROR_CODES } from 'better-auth';

/**
 * Maps better-auth semantic error codes to oRPC contract HTTP status keys.
 * Typed against `keyof typeof BASE_ERROR_CODES` to ensure new codes from better-auth updates
 * cause TypeScript errors until explicitly mapped.
 */
const AUTH_CODE_TO_STATUS: Record<keyof typeof BASE_ERROR_CODES, string> = {
    // 409 CONFLICT - duplicate/already exists
    USER_ALREADY_EXISTS: 'CONFLICT',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'CONFLICT',
    SOCIAL_ACCOUNT_ALREADY_LINKED: 'CONFLICT',
    LINKED_ACCOUNT_ALREADY_EXISTS: 'CONFLICT',
    EMAIL_ALREADY_VERIFIED: 'CONFLICT',
    USER_ALREADY_HAS_PASSWORD: 'CONFLICT',
    PASSWORD_ALREADY_SET: 'CONFLICT',

    // 401 UNAUTHORIZED - auth failures
    INVALID_PASSWORD: 'UNAUTHORIZED',
    INVALID_EMAIL_OR_PASSWORD: 'UNAUTHORIZED',
    INVALID_TOKEN: 'UNAUTHORIZED',
    TOKEN_EXPIRED: 'UNAUTHORIZED',
    SESSION_EXPIRED: 'UNAUTHORIZED',
    CREDENTIAL_ACCOUNT_NOT_FOUND: 'UNAUTHORIZED',
    SESSION_NOT_FRESH: 'UNAUTHORIZED',
    EMAIL_NOT_VERIFIED: 'UNAUTHORIZED',

    // 400 BAD_REQUEST - validation
    INVALID_EMAIL: 'BAD_REQUEST',
    INVALID_USER: 'BAD_REQUEST',
    PASSWORD_TOO_SHORT: 'BAD_REQUEST',
    PASSWORD_TOO_LONG: 'BAD_REQUEST',
    VALIDATION_ERROR: 'BAD_REQUEST',
    MISSING_FIELD: 'BAD_REQUEST',
    FIELD_NOT_ALLOWED: 'BAD_REQUEST',
    BODY_MUST_BE_AN_OBJECT: 'BAD_REQUEST',
    ASYNC_VALIDATION_NOT_SUPPORTED: 'BAD_REQUEST',
    CALLBACK_URL_REQUIRED: 'BAD_REQUEST',
    INVALID_CALLBACK_URL: 'BAD_REQUEST',
    INVALID_REDIRECT_URL: 'BAD_REQUEST',
    INVALID_ERROR_CALLBACK_URL: 'BAD_REQUEST',
    INVALID_NEW_USER_CALLBACK_URL: 'BAD_REQUEST',
    EMAIL_CAN_NOT_BE_UPDATED: 'BAD_REQUEST',
    EMAIL_MISMATCH: 'BAD_REQUEST',

    // 403 FORBIDDEN - origin/navigation blocks
    INVALID_ORIGIN: 'FORBIDDEN',
    MISSING_OR_NULL_ORIGIN: 'FORBIDDEN',
    CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: 'FORBIDDEN',
    METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED: 'FORBIDDEN',

    // 404 NOT_FOUND
    USER_NOT_FOUND: 'NOT_FOUND',
    USER_EMAIL_NOT_FOUND: 'NOT_FOUND',
    ACCOUNT_NOT_FOUND: 'NOT_FOUND',
    PROVIDER_NOT_FOUND: 'NOT_FOUND',

    // 500 INTERNAL_SERVER_ERROR - internal failures
    FAILED_TO_CREATE_USER: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_CREATE_SESSION: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_UPDATE_USER: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_GET_SESSION: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_GET_USER_INFO: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_UNLINK_LAST_ACCOUNT: 'INTERNAL_SERVER_ERROR',
    FAILED_TO_CREATE_VERIFICATION: 'INTERNAL_SERVER_ERROR',
    ID_TOKEN_NOT_SUPPORTED: 'INTERNAL_SERVER_ERROR',
    VERIFICATION_EMAIL_NOT_ENABLED: 'INTERNAL_SERVER_ERROR',
};

/**
 * Handles `@shipkit/auth`'s errors by matching them against your `errors` object provided by the oRPC contract.
 *
 * Primary strategy: check `err.body.code` against AUTH_CODE_TO_STATUS registry to convert
 * better-auth semantic error codes to contract error keys (e.g., USER_ALREADY_EXISTS -> CONFLICT).
 *
 * Fallback: match `err.status` directly against contract errors (for unmapped or direct HTTP statuses).
 *
 * If neither match, re-throw as a generic error.
 */
export function handleAuthError(
    err: unknown,
    errors: Record<string, unknown>,
): never {
    if (!(err instanceof AuthError)) {
        throw err;
    }

    // Primary: try to match error code to contract status
    if (
        err.body?.code &&
        typeof err.body.code === 'string' &&
        Object.hasOwn(AUTH_CODE_TO_STATUS, err.body.code)
    ) {
        const status =
            AUTH_CODE_TO_STATUS[
                err.body.code as keyof typeof AUTH_CODE_TO_STATUS
            ];
        if (Object.hasOwn(errors, status)) {
            const errorBuilder = errors[status];
            if (typeof errorBuilder === 'function') {
                throw (errorBuilder as (opts: { message: string }) => unknown)({
                    message:
                        err.body.message ??
                        err.message ??
                        'An authentication error occurred',
                });
            }
        }
    }

    // Fallback: match status directly
    if (
        err.status &&
        typeof err.status === 'string' &&
        Object.hasOwn(errors, err.status)
    ) {
        const errorBuilder = errors[err.status];
        if (typeof errorBuilder === 'function') {
            throw (errorBuilder as (opts: { message: string }) => unknown)({
                message: err.message ?? 'An authentication error occurred',
            });
        }
    }

    // If no match, throw as a normal error
    throw err;
}
