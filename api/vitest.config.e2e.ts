import { config } from 'dotenv';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

config({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error(
    'TEST_DATABASE_URL must be set and point to a database whose name ends in _test. ' +
      'The e2e tests wipe it.',
  );
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // All files share one database, so run them one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // Uploaded test files go to a temporary folder, not the project.
      FILES_DIR: join(tmpdir(), 'school-erp-e2e-files'),
      DATABASE_URL: testDatabaseUrl,
      APP_ORIGINS: 'http://localhost:4200',
      SEED_ADMIN_EMAIL: 'admin@test.local',
      SEED_ADMIN_PASSWORD: 'TestAdminPass123',
    },
  },
});
