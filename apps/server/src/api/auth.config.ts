import { sendEmail } from '@shipkit/email';
import {
    CHANGE_EMAIL_MAX_VERIFICATION_SENDS,
    OAUTH_POPUP_CALLBACK_PATH,
    OTP_LENGTH,
    OTP_RESEND_COOLDOWN_SECONDS,
} from '@shipkit/shared/constants';
import { contract } from '@shipkit/shared/orpc-contract';
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
    contract.auth.email.verify.magicLink['~orpc'].route.path;

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

const onSendChangeEmail: CreateAuthContext['config']['onSendChangeEmail'] =
    async (payload) => {
        if (!env.SMTP_HOST) {
            logger.warn(
                '[auth] SMTP not configured — simulating change-email {stage} email to {email}',
                {
                    stage: payload.stage,
                    email: payload.email,
                },
            );
            logger.info('[auth] Simulated change-email email: {payload}', {
                payload: { ...payload },
            });
            return;
        }
        const send =
            payload.stage === 'notification'
                ? sendEmail({
                      template: 'change-email-notice',
                      to: payload.email,
                      props: {
                          email: payload.email,
                          newEmail: payload.newEmail,
                      },
                      config: smtpConfig,
                  })
                : sendEmail({
                      template: 'change-email-code',
                      to: payload.email,
                      props: payload, // already { stage, email, otp, expiresInMinutes }
                      config: smtpConfig,
                  });
        void send.catch((error) =>
            logger.error('[auth] Background change-email {stage} send failed', {
                stage: payload.stage,
                error,
            }),
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
    otp: {
        length: OTP_LENGTH,
        resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    },
    changeEmail: {
        maxVerificationSends: CHANGE_EMAIL_MAX_VERIFICATION_SENDS,
    },
    cookieDomain,
    oauth: {
        redirectURITemplate:
            `${env.WEB_URL}${contract.auth.oauth.callback['~orpc'].route.path}` as `${string}{${string}}${string}`,
        // @see [OAuth Popup Flow] Configures the backend to redirect the user to the frontend callback page upon successful authentication.
        callbackURL: `${env.WEB_URL}${OAUTH_POPUP_CALLBACK_PATH}`,
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },
    onSendSignInEmail,
    onSendChangeEmail,
};
