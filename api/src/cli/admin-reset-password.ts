/**
 * Gives a login a new temporary password, from the server, when nobody can sign in to do it
 * (for example the only Super Admin forgot their password). The person must change it at their
 * next sign-in, and is signed out everywhere. Audited as auth.password_reset_cli.
 *   npm run admin:reset-password -- admin@school.org            (after npm run build; home school)
 *   npm run admin:reset-password -- admin@school.org hesj       (another school, by its code)
 * Point DATABASE_URL at the database whose login you are recovering.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { tempPasswordDays } from '../common/password.js';

const identifier = process.argv[2];
if (!identifier) {
  console.error('Give the e-mail (or sign-in name) of the login to recover.');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const { fullName, temporaryPassword } = await app
    .get(AuthService)
    .recoverPassword(identifier, process.argv[3]);
  console.log(`New temporary password for ${fullName}: ${temporaryPassword}`);
  console.log(
    `It works for ${tempPasswordDays()} day(s) and must be changed at the next sign-in.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
