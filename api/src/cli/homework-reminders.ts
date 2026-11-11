/**
 * Sends the "due tomorrow" reminder for homework. Safe to run repeatedly: each homework is reminded once.
 * Run it once a day, for example at 4 pm India time from cron:
 *   npm run homework:remind          (after npm run build)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { HomeworkService } from '../modules/homework/homework.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
try {
  const count = await app.get(HomeworkService).sendDueReminders();
  console.log(`Reminders sent for ${count} homework due tomorrow.`);
} finally {
  await app.close();
}
