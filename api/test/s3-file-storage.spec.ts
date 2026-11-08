import { randomBytes } from 'node:crypto';
import {
  S3FileStorage,
  type S3Settings,
} from '../src/modules/files/storage/s3-file-storage.js';
import { startFakeS3 } from './support/fake-s3-server.js';

type Fake = Awaited<ReturnType<typeof startFakeS3>>;

const readAll = async (stream: AsyncIterable<unknown>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

describe('S3FileStorage (real AWS SDK against an in-process S3-like server)', () => {
  let fake: Fake;
  const settings = (over: Partial<S3Settings> = {}): S3Settings => ({
    bucket: fake.bucket,
    region: 'ap-south-1',
    endpoint: fake.endpoint,
    accessKeyId: 'AKIATESTKEY',
    secretAccessKey: 'test-secret',
    forcePathStyle: true,
    ...over,
  });

  beforeEach(async () => {
    fake = await startFakeS3();
  });
  afterEach(() => fake.close());

  it('stores and reads back the exact bytes, and keeps the content type', async () => {
    const storage = new S3FileStorage(settings());
    const bytes = randomBytes(2048);
    await storage.put('school-1/2026/photo.png', bytes, 'image/png');

    const stored = fake.objects.get('school-1/2026/photo.png');
    expect(stored?.body.equals(bytes)).toBe(true);
    expect(stored?.contentType).toBe('image/png');
    expect(
      (await readAll(await storage.read('school-1/2026/photo.png'))).equals(
        bytes,
      ),
    ).toBe(true);
  });

  it('handles a larger file', async () => {
    const storage = new S3FileStorage(settings());
    const bytes = randomBytes(3 * 1024 * 1024);
    await storage.put('big.bin', bytes);
    expect((await readAll(await storage.read('big.bin'))).equals(bytes)).toBe(
      true,
    );
  });

  it('addresses the bucket in the path, and signs the request with the configured key', async () => {
    const storage = new S3FileStorage(settings());
    await storage.put('a/b.png', Buffer.from('x'), 'image/png');

    const put = fake.requests.find((r) => r.method === 'PUT');
    expect(put?.path).toBe('/test-bucket/a/b.png');
    expect(put?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTKEY\/\d{8}\/ap-south-1\/s3\/aws4_request/,
    );
  });

  it('does not send checksum headers that S3-compatible services may reject', async () => {
    await new S3FileStorage(settings()).put('c.bin', Buffer.from('x'));
    const put = fake.requests.find((r) => r.method === 'PUT');
    const names = Object.keys(put?.headers ?? {});
    expect(
      names.some(
        (n) =>
          n.startsWith('x-amz-checksum') ||
          n === 'x-amz-sdk-checksum-algorithm',
      ),
    ).toBe(false);
  });

  it('stores everything under the key prefix when one is set', async () => {
    const storage = new S3FileStorage(settings({ keyPrefix: 'school-erp/' }));
    await storage.put('a/b.png', Buffer.from('x'));
    expect([...fake.objects.keys()]).toEqual(['school-erp/a/b.png']);
    expect((await readAll(await storage.read('a/b.png'))).toString()).toBe('x');
    await storage.delete('a/b.png');
    expect(fake.objects.size).toBe(0);
  });

  it('reading a file that does not exist fails with NoSuchKey', async () => {
    const storage = new S3FileStorage(settings());
    await expect(storage.read('missing.png')).rejects.toMatchObject({
      name: 'NoSuchKey',
    });
  });

  it('deletes, and deleting a missing file is not an error', async () => {
    const storage = new S3FileStorage(settings());
    await storage.put('gone.bin', Buffer.from('x'));
    await storage.delete('gone.bin');
    expect(fake.objects.has('gone.bin')).toBe(false);
    await expect(storage.delete('gone.bin')).resolves.toBeUndefined();
  });

  it("shows the service's error when it refuses (wrong permissions)", async () => {
    const storage = new S3FileStorage(settings());
    fake.failNext(403, 'AccessDenied');
    await expect(storage.put('x.bin', Buffer.from('x'))).rejects.toMatchObject({
      name: 'AccessDenied',
    });
  });

  it('shows a clear error for a bucket that does not exist', async () => {
    const storage = new S3FileStorage(
      settings({ bucket: 'some-other-bucket' }),
    );
    await expect(storage.put('x.bin', Buffer.from('x'))).rejects.toMatchObject({
      name: 'NoSuchBucket',
    });
  });

  it.each(['../escape.png', '/absolute.png', 'a/../../escape.png', '..', ''])(
    'refuses a key that could leave its folder: "%s"',
    async (key) => {
      const storage = new S3FileStorage(settings());
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(
        /Invalid storage key/,
      );
      await expect(storage.read(key)).rejects.toThrow(/Invalid storage key/);
      await expect(storage.delete(key)).rejects.toThrow(/Invalid storage key/);
      expect(fake.requests).toHaveLength(0);
    },
  );
});
