import type { FileStorage } from './file-storage.js';
import { LocalFileStorage } from './local-file-storage.js';
import { S3FileStorage } from './s3-file-storage.js';

type Get = (name: string) => string | undefined;

const present = (value: string | undefined) =>
  value?.trim() ? value.trim() : undefined;

/**
 * Picks where file bytes are kept from the environment:
 *   FILES_DRIVER=local (default)  uses FILES_DIR
 *   FILES_DRIVER=s3               uses the S3_* settings
 * A wrong or incomplete setting stops the app at start-up with a clear message,
 * instead of failing on the first upload.
 */
export function createFileStorage(get: Get): FileStorage {
  const driver = (present(get('FILES_DRIVER')) ?? 'local').toLowerCase();

  if (driver === 'local') {
    return new LocalFileStorage(present(get('FILES_DIR')) ?? './storage');
  }
  if (driver !== 's3') {
    throw new Error(`Unknown FILES_DRIVER "${driver}". Use "local" or "s3".`);
  }

  const missing = ['S3_BUCKET', 'S3_REGION'].filter(
    (name) => !present(get(name)),
  );
  if (missing.length) {
    throw new Error(
      `FILES_DRIVER is "s3" but these settings are missing: ${missing.join(', ')}`,
    );
  }
  const accessKeyId = present(get('S3_ACCESS_KEY_ID'));
  const secretAccessKey = present(get('S3_SECRET_ACCESS_KEY'));
  if (!!accessKeyId !== !!secretAccessKey) {
    throw new Error(
      'Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither (to use an IAM role).',
    );
  }

  const prefix = present(get('S3_KEY_PREFIX'));
  return new S3FileStorage({
    bucket: present(get('S3_BUCKET')) as string,
    region: present(get('S3_REGION')) as string,
    endpoint: present(get('S3_ENDPOINT')),
    accessKeyId,
    secretAccessKey,
    forcePathStyle:
      present(get('S3_FORCE_PATH_STYLE'))?.toLowerCase() === 'true',
    keyPrefix: prefix
      ? prefix.endsWith('/')
        ? prefix
        : `${prefix}/`
      : undefined,
  });
}
