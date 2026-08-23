import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      ADMIN_PASSWORD: 'vitest-only-admin-password',
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
      SESSION_SECRET: 'vitest-only-session-secret-not-for-production',
      // Keep test artefacts out of the real data directory.
      DATA_DIR: './server/.test-data',
      PUBLIC_BASE_URL: 'http://localhost:8787',
      LOG_LEVEL: 'silent',
    },
  },
});
