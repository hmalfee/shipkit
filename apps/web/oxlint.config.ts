import { defineConfig } from 'oxlint';

import base from '@shipkit/oxlint-config/base';
import next from '@shipkit/oxlint-config/next';
import reactCompiler from '@shipkit/oxlint-config/react-compiler';

export default defineConfig({
    extends: [base, next, reactCompiler],
});
