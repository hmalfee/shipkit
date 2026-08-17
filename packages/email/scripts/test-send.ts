import fs from 'node:fs';
import { inspect, parseArgs } from 'node:util';

import * as p from '@clack/prompts';

import type { TemplateName } from '../src/registry';

import { sendEmail } from '../src';
import { TEMPLATE_REGISTRY } from '../src/registry';

/**
 * Dynamically infers the props a template component expects, by calling it
 * with a Proxy that records every property access.
 *
 * Handles plain function components, React.memo(...) and React.forwardRef(...)
 * wrappers.
 */
function getTemplateProps(name: TemplateName): string[] {
    const { component } = TEMPLATE_REGISTRY[name];
    const accessed = new Set<string>();

    const proxy = new Proxy(
        {},
        {
            get(_, prop) {
                if (typeof prop === 'string' && prop !== 'then') {
                    accessed.add(prop);
                }
                return `dummy_${String(prop)}`;
            },
        },
    );

    // Unwrap React.memo / React.forwardRef so we still reach a callable function.
    // memo:      { $$typeof: Symbol(react.memo), type: Component }
    // forwardRef:{ $$typeof: Symbol(react.forward_ref), render: (props, ref) => ... }
    const target = component as unknown;
    const renderFn =
        typeof target === 'function'
            ? target
            : typeof (target as { type?: unknown })?.type === 'function'
              ? (target as { type: (props: unknown) => unknown }).type
              : typeof (target as { render?: unknown })?.render === 'function'
                ? (
                      target as {
                          render: (props: unknown, ref: unknown) => unknown;
                      }
                  ).render
                : null;

    if (!renderFn) {
        // Not something we know how to introspect (e.g. a class component) —
        // fail closed rather than throwing.
        return [];
    }

    try {
        (renderFn as (props: unknown, ref?: unknown) => unknown)(
            proxy,
            undefined,
        );
    } catch {
        // Ignore render errors (missing hooks/context/etc.) — we only care
        // about which properties were touched before it blew up.
    }

    return Array.from(accessed);
}

/**
 * "verifyUrl" -> "Verify Url", "userID" -> "User ID"
 */
function toLabel(prop: string): string {
    const spaced = prop
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // lower/digit -> Upper
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // ACRONYMWord -> ACRONYM Word
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

p.intro('SMTP Test — @shipkit/email');

const { values: args } = parseArgs({
    options: {
        'env-file': {
            type: 'string',
        },
    },
    strict: false,
});

const envFile = args['env-file'] ?? '.env';
if (typeof envFile === 'string' && fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

// oxlint-disable-next-line
const env = process.env;

const smtpHost =
    env.SMTP_HOST ??
    (await p.text({
        message: 'SMTP host',
        placeholder: 'smtp.example.com',
    }));
if (p.isCancel(smtpHost)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const smtpPort =
    env.SMTP_PORT ??
    (await p.text({
        message: 'SMTP port',
        placeholder: '587',
        defaultValue: '587',
    }));
if (p.isCancel(smtpPort)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const smtpUser = env.SMTP_USER ?? (await p.text({ message: 'SMTP username' }));
if (p.isCancel(smtpUser)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const smtpPass =
    env.SMTP_PASSWORD ?? (await p.password({ message: 'SMTP password' }));
if (p.isCancel(smtpPass)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const from =
    env.EMAIL_FROM ??
    (await p.text({
        message: 'From address',
        placeholder: 'noreply@example.com',
    }));
if (p.isCancel(from)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const to =
    env.EMAIL_TO ??
    (await p.text({
        message: 'To address',
        placeholder: 'you@example.com',
    }));
if (p.isCancel(to)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const templateOptions = (Object.keys(TEMPLATE_REGISTRY) as TemplateName[]).map(
    (name) => ({
        value: name,
        label: name,
        hint: TEMPLATE_REGISTRY[name].subject,
    }),
);

const template = await p.select<TemplateName>({
    message: 'Template',
    options: templateOptions,
});
if (p.isCancel(template)) {
    p.cancel('Cancelled.');
    process.exit(0);
}

const propNames = getTemplateProps(template);
const props: Record<string, string> = {};
for (const prop of propNames) {
    const val = await p.text({
        message: toLabel(prop),
        placeholder: `Enter ${toLabel(prop).toLowerCase()}`,
    });
    if (p.isCancel(val)) {
        p.cancel('Cancelled.');
        process.exit(0);
    }
    props[prop] = val;
}

const config = {
    host: smtpHost,
    port: Number(smtpPort),
    user: smtpUser,
    password: smtpPass,
    from,
};

const s = p.spinner();
s.start(`Sending ${template} to ${to}…`);
try {
    const info = await sendEmail({
        template,
        to,
        props: props as unknown as Parameters<typeof sendEmail>[0]['props'],
        config,
    });
    s.stop('Email sent.');

    p.log.success('Delivery details:');
    p.log.message(inspect(info, { colors: true, depth: null }));
} catch (err) {
    s.stop('Send failed.');
    p.log.error(String(err));
    process.exit(1);
}

p.outro('Done.');
process.exit(0);
