import { execSync } from 'node:child_process';

/** Before the e2e suite: rebuild the _test database from the migrations and seed it. */
export default function setup() {
  // For fast reruns while debugging a single spec: E2E_SKIP_RESET=1 npm run test:e2e
  if (process.env.E2E_SKIP_RESET) return;
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test(\?|$)/.test(url)) {
    throw new Error(
      'Refusing to reset a database whose name does not end in _test',
    );
  }
  const env = {
    ...process.env,
    DATABASE_URL: url,
    SEED_ADMIN_EMAIL: 'admin@test.local',
    SEED_ADMIN_PASSWORD: 'TestAdminPass123',
  };
  try {
    execSync('npx prisma migrate reset --force', {
      encoding: 'utf8',
      stdio: 'pipe',
      env,
    });
    // Prisma 7 no longer seeds automatically after a reset.
    execSync('npx prisma db seed', { encoding: 'utf8', stdio: 'pipe', env });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(
      `Could not prepare the test database:\n${e.stdout ?? ''}\n${e.stderr ?? ''}`,
    );
  }
}
