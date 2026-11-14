/**
 * Sends the push messages that are due: ones held back for quiet hours and ones waiting to be retried.
 * Safe to run at any time and from several places at once (an advisory lock makes runs take turns).
 * Run it every minute from cron:
 *   npm run push:send-due          (after npm run build)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PushService } from '../modules/push/push.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const push = app.get(PushService);
  if (!push.enabled) {
    console.log(
      'Push is off (PUSH_DRIVER is not set to log or expo). Nothing sent.',
    );
  } else {
    const r = await push.sendDue();
    console.log(
      r.busy
        ? 'Another run is sending; nothing to do here.'
        : `Push: ${r.sent} sent, ${r.retried} to retry, ${r.failed} failed, ${r.dropped} dropped.`,
    );
  }
} finally {
  await app.close();
}
