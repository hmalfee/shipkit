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
const changeEmailConfirmPath =
    contract.auth.changeEmail.confirm['~orpc'].route.path;
const changeEmailVerifyPath =
    contract.auth.changeEmail.verify['~orpc'].route.path;

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
    env.SMTP_HOST
        ? {
              confirmation: async ({
                  currentEmail,
                  newEmail,
                  token,
                  callbackURL,
              }) => {
                  void sendEmail({
                      template: 'change-email-confirmation',
                      to: currentEmail,
                      props: {
                          currentEmail,
                          url: buildAuthLink(changeEmailConfirmPath, {
                              token,
                              callbackURL,
                          }),
                          newEmail,
                      },
                      config: smtpConfig,
                  }).catch((error) => {
                      logger.error(
                          '[auth] Background change-email confirm send failed',
                          { error },
                      );
                  });
              },
              verification: async ({ newEmail, token, callbackURL }) => {
                  void sendEmail({
                      template: 'change-email-verification',
                      to: newEmail,
                      props: {
                          url: buildAuthLink(changeEmailVerifyPath, {
                              token,
                              callbackURL,
                          }),
                          newEmail,
                      },
                      config: smtpConfig,
                  }).catch((error) => {
                      logger.error(
                          '[auth] Background change-email verify send failed',
                          { error },
                      );
                  });
              },
          }
        : {
              confirmation: async ({ currentEmail, token, callbackURL }) => {
                  logger.warn(
                      '[auth] SMTP not configured — simulating change-email confirmation to {currentEmail}',
                      { currentEmail },
                  );
                  logger.info(
                      '[auth] Simulated change-email confirmation\n  Link:    {link}',
                      {
                          link: buildAuthLink(changeEmailConfirmPath, {
                              token,
                              callbackURL,
                          }),
                      },
                  );
              },
              verification: async ({ newEmail, token, callbackURL }) => {
                  logger.warn(
                      '[auth] SMTP not configured — simulating change-email verification to {newEmail}',
                      { newEmail },
                  );
                  logger.info(
                      '[auth] Simulated change-email verification\n  Link:    {link}',
                      {
                          link: buildAuthLink(changeEmailVerifyPath, {
                              token,
                              callbackURL,
                          }),
                      },
                  );
              },
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
            `${env.WEB_URL}${contract.auth.oauth.callback['~orpc'].route.path}` as `${string}{${string}}${string}`,
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },
    onSendSignInEmail,
    onSendChangeEmail,
};
