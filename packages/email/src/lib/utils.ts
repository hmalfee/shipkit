// Prefixes that indicate email-unsupported pseudo-states/modifiers
const STRIP_PREFIXES = [
    'hover:',
    'focus:',
    'focus-visible:',
    'focus-within:',
    'active:',
    'visited:',
    'disabled:',
    'enabled:',
    'checked:',
    'indeterminate:',
    'aria-',
    'data-',
    'group-',
    'group/',
    'peer-',
    'has-',
    'dark:',
    'sm:',
    'md:',
    'lg:',
    'xl:',
    '2xl:',
    'file:',
    'placeholder:',
];

// Base class names (no prefix) to strip
const STRIP_CLASSES = new Set([
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'grow',
    'shrink',
    'shrink-0',
    'grow-0',
    'outline-none',
    'outline',
    'select-none',
    'select-auto',
    'select-text',
    'select-all',
    'group',
    'peer',
]);

// Patterns for classes to strip (startsWith match)
const STRIP_PATTERNS = [
    'transition',
    'duration-',
    'ease-',
    'delay-',
    'animate-',
    'cursor-',
    'pointer-events-',
    'touch-',
    'ring-',
    'ring/',
    'shadow-',
    'shadow/',
    'items-',
    'justify-',
    'content-',
    'place-',
    'self-',
    'gap-',
    'col-',
    'row-',
    'order-',
    'flex-',
    'basis-',
    'min-h-',
    'max-h-',
    'bg-clip-',
    'backdrop-',
    'blur-',
    'snap-',
    'will-change-',
    'scroll-',
    'appearance-',
    'h-',
    'size-',
];

/**
 * Transforms standard Tailwind UI component classes into email-safe inline classes.
 *
 * - Strips pseudo-states (hover:, focus:), dark mode variants, and responsive breakpoints
 * - Strips flexbox, transitions, and interactive properties that fail in email clients
 *
 * @example
 * ```tsx
 * // From a class string
 * const emailCta = toEmailClasses(cn(buttonVariants({ variant: 'default' }), "no-underline box-border px-6 text-sm"));
 * ```
 */
export function toEmailClasses(classes: string): string {
    const tokens = classes.split(/\s+/).filter(Boolean);
    const result: string[] = [];

    for (const cls of tokens) {
        // Strip complex arbitrary selectors
        if (cls.includes('[&') || cls.startsWith('*:')) continue;
        // Strip prefixed classes
        if (
            STRIP_PREFIXES.some(
                (p) => cls.startsWith(p) || cls.includes(':' + p),
            )
        )
            continue;
        // Strip exact matches
        if (STRIP_CLASSES.has(cls)) continue;
        // Strip pattern matches
        if (STRIP_PATTERNS.some((p) => cls.startsWith(p))) continue;

        result.push(cls);
    }

    return Array.from(new Set(result)).join(' ');
}
