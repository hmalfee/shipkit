import type { Redis } from '@mento-mark/db/redis';
import type { AuthDatabase } from './config';

import { createBetterAuthConfig } from './config';

// Never use this in your application code, this is meant for the cli to generate the schema
export const auth = process.argv.join(' ').includes('better-auth')
    ? createBetterAuthConfig({} as AuthDatabase, {} as Redis, '', {
          secret: '',
          useSecureCookies: false,
          oauth: {
              google: { clientId: '', clientSecret: '' },
          },
      })
    : undefined;
