/**
 * Checks that the S3 settings in .env work: stores a small test file, reads it
 * back, and deletes it. Run it with `npm run s3:check` after pasting the
 * secrets into api/.env. It never touches real files.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createFileStorage } from '../src/modules/files/storage/create-file-storage.js';

const HINTS: Record<string, string> = {
  InvalidAccessKeyId: 'The access key id is not recognised. Check S3_ACCESS_KEY_ID (and that it is for this account or service).',
  SignatureDoesNotMatch: 'The secret does not match the access key. Check S3_SECRET_ACCESS_KEY for a typo or extra spaces.',
  AccessDenied: 'The key is valid but not allowed to do this. It needs s3:PutObject, s3:GetObject and s3:DeleteObject on the bucket (and prefix).',
  NoSuchBucket: 'The bucket does not exist in this region or account. Check S3_BUCKET and S3_REGION (and S3_ENDPOINT for non-AWS services).',
  PermanentRedirect: 'The bucket is in a different region. Set S3_REGION to the bucket\'s region.',
  AuthorizationHeaderMalformed: 'The region looks wrong. Set S3_REGION to the bucket\'s region.',
};

async function main() {
  process.env.FILES_DRIVER = 's3'; // this check is always about S3, whatever .env says for the app
  const storage = createFileStorage((name) => process.env[name]);
  const key = `_healthcheck/${randomUUID()}.txt`;
  const body = Buffer.from(`school-erp storage check ${new Date().toISOString()}`);

  process.stdout.write('Writing a test file... ');
  await storage.put(key, body, 'text/plain');
  console.log('ok');

  process.stdout.write('Reading it back... ');
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.read(key)) chunks.push(Buffer.from(chunk as Uint8Array));
  if (!Buffer.concat(chunks).equals(body)) throw new Error('The file that came back is not what was stored');
  console.log('ok');

  process.stdout.write('Deleting it... ');
  await storage.delete(key);
  console.log('ok');

  console.log('\nS3 storage works. Set FILES_DRIVER=s3 to use it in the app.');
}

main().catch((error: unknown) => {
  const name = (error as { name?: string }).name ?? 'Error';
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nFailed: ${name}: ${message}`);
  if (HINTS[name]) console.error(`Hint: ${HINTS[name]}`);
  else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    console.error('Hint: The storage service cannot be reached. Check S3_ENDPOINT (leave it empty for AWS) and the internet connection.');
  }
  process.exit(1);
});
