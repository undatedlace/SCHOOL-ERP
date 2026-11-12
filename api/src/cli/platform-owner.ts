/**
 * Platform owners have no sign-up page: they are made, and recovered, from the server.
 *   npm run owner:create -- you@example.com "Your Name"     (after npm run build)
 *   npm run owner:reset-password -- you@example.com
 * Each prints a temporary password, which works for 2 days and must be changed at the first
 * sign-in at /platform/login. Point DATABASE_URL at the right database.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PlatformAuthService } from '../modules/platform/platform-auth.service.js';

const [command, email, ...nameParts] = process.argv.slice(2);
if (!['create', 'reset-password'].includes(command ?? '') || !email) {
  console.error(
    'Usage: owner:create -- <email> "<full name>"  or  owner:reset-password -- <email>',
  );
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const owners = app.get(PlatformAuthService);
  const { temporaryPassword } =
    command === 'create'
      ? await owners.createOwner(email, nameParts.join(' '))
      : await owners.recoverOwner(email);
  console.log(
    `Temporary password for ${email.toLowerCase()}: ${temporaryPassword}`,
  );
  console.log(
    'Sign in at /platform/login and change it there (it works for 2 days).',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
