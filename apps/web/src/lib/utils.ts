import type { Route } from 'next';

/**
 * Only allow same-origin relative paths as redirect targets, and never send
 * someone back to the login page itself (which would just bounce them again
 * once session checker picks them up as signed in and create a loop).
 */
export function sanitizeRedirect(
    redirect: string | string[] | undefined | null,
): Route {
    const authRoute = '/auth' satisfies Route;
    const value = Array.isArray(redirect) ? redirect.join('/') : redirect;

    if (
        !value ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.includes('\\')
    ) {
        return '/';
    }
    if (value === authRoute || value.startsWith(`${authRoute}/`)) {
        return '/';
    }

    return value as Route;
}

/**
 * Get initials from a user's full name.
 */
export function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
}
