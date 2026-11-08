/**
 * Deletes uploaded files that were never attached to a student, staff member or
 * application (for example a photograph chosen on a form that was then abandoned).
 * Safe to run repeatedly, for example once a day from cron:
 *   npm run files:cleanup            (after npm run build; files older than 24 hours)
 *   npm run files:cleanup -- 72      (files older than 72 hours)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { FilesService } from '../modules/files/files.service.js';

const hours = Number(process.argv[2] ?? 24);
if (!Number.isFinite(hours) || hours < 1) {
  console.error('Give a number of hours, 1 or more.');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const removed = await app.get(FilesService).purgeUnattached(hours);
  console.log(
    `Removed ${removed} unattached file(s) older than ${hours} hours.`,
  );
} finally {
  await app.close();
}
