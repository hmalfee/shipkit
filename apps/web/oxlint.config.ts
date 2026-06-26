import { defineConfig } from 'oxlint';

import base from '@mento-mark/oxlint-config/base';
import next from '@mento-mark/oxlint-config/next';
import reactCompiler from '@mento-mark/oxlint-config/react-compiler';

export default defineConfig({
    extends: [base, next, reactCompiler],
});
