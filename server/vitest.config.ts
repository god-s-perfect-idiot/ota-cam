import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      ADMIN_PASSWORD: 'test-password-123',
      ENCRYPTION_KEY: '11'.repeat(32),
      SESSION_SECRET: 'session-secret-for-tests-only',
      // Keep test artefacts out of the real data directory.
      DATA_DIR: './server/.test-data',
      PUBLIC_BASE_URL: 'http://localhost:8787',
      LOG_LEVEL: 'silent',
    },
  },
});
