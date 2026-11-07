import { createFileStorage } from '../src/modules/files/storage/create-file-storage.js';
import { LocalFileStorage } from '../src/modules/files/storage/local-file-storage.js';
import { S3FileStorage } from '../src/modules/files/storage/s3-file-storage.js';

const env = (values: Record<string, string>) => (name: string) => values[name];

const s3 = {
  FILES_DRIVER: 's3',
  S3_BUCKET: 'my-bucket',
  S3_REGION: 'ap-south-1',
  S3_ACCESS_KEY_ID: 'AKIATEST',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('createFileStorage', () => {
  it('uses the local disk by default', () => {
    expect(createFileStorage(env({}))).toBeInstanceOf(LocalFileStorage);
    expect(createFileStorage(env({ FILES_DRIVER: '  ' }))).toBeInstanceOf(
      LocalFileStorage,
    );
    expect(
      createFileStorage(env({ FILES_DRIVER: 'LOCAL', FILES_DIR: '/tmp/x' })),
    ).toBeInstanceOf(LocalFileStorage);
  });

  it('uses S3 when asked, whatever the capitals', () => {
    expect(createFileStorage(env(s3))).toBeInstanceOf(S3FileStorage);
    expect(
      createFileStorage(env({ ...s3, FILES_DRIVER: 'S3' })),
    ).toBeInstanceOf(S3FileStorage);
  });

  it('accepts the optional S3 settings', () => {
    const storage = createFileStorage(
      env({
        ...s3,
        S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        S3_FORCE_PATH_STYLE: 'true',
        S3_KEY_PREFIX: 'erp',
      }),
    );
    expect(storage).toBeInstanceOf(S3FileStorage);
  });

  it('refuses to start with an unknown driver', () => {
    expect(() => createFileStorage(env({ FILES_DRIVER: 'dropbox' }))).toThrow(
      /Unknown FILES_DRIVER "dropbox"/,
    );
  });

  it('says exactly which S3 settings are missing', () => {
    expect(() => createFileStorage(env({ FILES_DRIVER: 's3' }))).toThrow(
      /S3_BUCKET, S3_REGION/,
    );
    expect(() => createFileStorage(env({ ...s3, S3_BUCKET: ' ' }))).toThrow(
      /S3_BUCKET/,
    );
    expect(() => createFileStorage(env({ ...s3, S3_REGION: '' }))).toThrow(
      /S3_REGION/,
    );
  });

  it('needs both access keys or neither (an IAM role is used when there are none)', () => {
    expect(() =>
      createFileStorage(env({ ...s3, S3_SECRET_ACCESS_KEY: '' })),
    ).toThrow(/both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY/);
    expect(() =>
      createFileStorage(env({ ...s3, S3_ACCESS_KEY_ID: '' })),
    ).toThrow(/both/);
    expect(
      createFileStorage(
        env({ ...s3, S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' }),
      ),
    ).toBeInstanceOf(S3FileStorage);
  });
});
