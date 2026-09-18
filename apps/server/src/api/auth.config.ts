import { sendEmail } from '@shipkit/email';
import { contract } from '@shipkit/shared/orpc';
import { logger } from '@shipkit/telemetry/logger';

import { env } from '@/env';

import type { CreateAuthContext } from '@shipkit/auth';

// `allOrNone` in env.ts guarantees these five SMTP_* / TRANSACTIONAL_SENDER vars are either
// all set or all undefined — so the `!` assertions below are safe, and callers only need to
// check one of them (we use env.SMTP_HOST) to know the whole config is present.
const smtpConfig = {
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT!,
    user: env.SMTP_USER!,
    password: env.SMTP_PASSWORD!,
    from: env.TRANSACTIONAL_SENDER!,
};

const verifyMagicLinkPath =
    contract.auth.email.verifyMagicLink['~orpc'].route.path;

// Instead of the raw server URL, we use the main app's domain in transactional emails so that
// users see a familiar domain instead of a backend subdomain.
function buildAuthLink(
    routePath: `/${string}` | undefined,
    params: { token: string; callbackURL: string },
) {
    return `${env.WEB_URL}${routePath}?token=${params.token}&callbackURL=${encodeURIComponent(params.callbackURL)}`;
}

const onSendSignInEmail: CreateAuthContext['config']['onSendSignInEmail'] =
    env.SMTP_HOST
        ? async ({
              email,
              otp,
              magicLink: { token, callbackURL },
              expiresInMinutes,
          }) => {
              // Fire-and-forget: we deliberately do not await this promise so the API responds instantly.
              void sendEmail({
                  template: 'email-sign-in',
                  to: email,
                  props: {
                      magicLink: buildAuthLink(verifyMagicLinkPath, {
                          token,
                          callbackURL,
                      }),
                      otp,
                      expiresInMinutes,
                  },
                  config: smtpConfig,
              }).catch((error) => {
                  logger.error('[auth] Background email send failed', {
                      error,
                  });
              });
          }
        : async ({
              email,
              magicLink: { token, callbackURL },
              otp,
              expiresInMinutes,
          }) => {
              logger.warn(
                  '[auth] SMTP not configured — simulating sign-in email instead of sending it to {email}',
                  { email },
              );
              logger.info(
                  '[auth] Simulated sign-in email\n  OTP:     {otp}\n  Link:    {link}\n  Expires: {expiresInMinutes}m',
                  {
                      otp,
                      link: buildAuthLink(verifyMagicLinkPath, {
                          token,
                          callbackURL,
                      }),
                      expiresInMinutes,
                  },
              );
          };

const serverHost = new URL(env.SERVER_URL).hostname;
const cookieDomain =
    serverHost === 'localhost'
        ? // sharing cookies within subdomains not
          // needed/supported for localhost
          undefined
        : serverHost.endsWith('.sslip.io')
          ? // enable <lanIp>.sslip.io subdomains to share cookies
            serverHost.split('.').slice(-6).join('.')
          : // enable <domainName>.<tld> subdomains to share cookies
            serverHost.split('.').slice(-2).join('.');

export const authConfig: CreateAuthContext['config'] = {
    secret: env.AUTH_SECRET,
    useSecureCookies: env.USE_SECURE_AUTH_COOKIES ?? false,
    cookieDomain,
    oauth: {
        redirectURITemplate:
            `${env.SERVER_URL}${contract.auth.oauthCallback['~orpc'].route.path}` as `${string}{${string}}${string}`,
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },
    onSendSignInEmail,
};
