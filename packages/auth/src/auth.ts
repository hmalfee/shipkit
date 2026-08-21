import type { Redis } from '@shipkit/db/redis';
import type { AuthDatabase } from './config';

import { createBetterAuthConfig } from './config';

// Never export this file or use it around in this package,
// this is meant for the `schema:gen` script to catch and
// generate the schema
export const auth = process.argv.join(' ').includes('auth')
    ? createBetterAuthConfig(
          {} as AuthDatabase,
          {} as Redis,
          'http://localhost',
          {
              secret: '',
              useSecureCookies: false,
              oauth: {
                  google: { clientId: '', clientSecret: '' },
              },
          },
      )
    : undefined;
