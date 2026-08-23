import nodemailer from 'nodemailer';
import React from 'react';
import { render } from 'react-email';

import type { TemplateName, TemplateProps } from './registry';

import { TEMPLATE_REGISTRY } from './registry';

// Workaround for tsx v4 bug: https://github.com/privatenumber/tsx/issues/696
// 1. tsx ignores this package's tsconfig.json because the entry point is in apps/server.
// 2. Even if we add "jsx": "react-jsx" to the consumer (apps/server), esbuild drops the setting when crossing the monorepo package boundary.
// As a result, email templates compile using the default classic JSX transform (React.createElement).
// Injecting React globally allows that fallback transform to work at runtime.
(globalThis as never as { React: typeof React }).React = React;

// Transporter
export type SmtpConfig = {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
};

function createTransporter(config: SmtpConfig) {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.password },
    });
}

// Renderer
export async function getHTML<T extends TemplateName>(
    name: T,
    props: TemplateProps<T>,
): Promise<string> {
    const { component: Component } = TEMPLATE_REGISTRY[name];
    const html = await render(React.createElement(Component as never, props));
    return html;
}

// Sender
export async function sendEmail<T extends TemplateName>(opts: {
    template: T;
    to: string;
    props: TemplateProps<T>;
    config: SmtpConfig;
}) {
    const html = await getHTML(opts.template, opts.props);
    const { subject } = TEMPLATE_REGISTRY[opts.template];
    const transporter = createTransporter(opts.config);
    const info = await transporter.sendMail({
        from: opts.config.from,
        to: opts.to,
        subject,
        html,
    });

    return info;
}
