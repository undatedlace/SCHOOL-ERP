import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileStorage } from './local-file-storage.js';

describe('LocalFileStorage', () => {
  let dir: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'erp-files-'));
    storage = new LocalFileStorage(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const readAll = async (key: string) => {
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.read(key))
      chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };

  it('stores and reads back bytes, creating folders as needed', async () => {
    await storage.put('school/2026/a.bin', Buffer.from([1, 2, 3]));
    expect([...(await readAll('school/2026/a.bin'))]).toEqual([1, 2, 3]);
    expect([...(await readFile(join(dir, 'school/2026/a.bin')))]).toEqual([
      1, 2, 3,
    ]);
  });

  it('never overwrites an existing file', async () => {
    await storage.put('a.bin', Buffer.from('one'));
    await expect(storage.put('a.bin', Buffer.from('two'))).rejects.toThrow();
    expect((await readAll('a.bin')).toString()).toBe('one');
  });

  it('deletes, and deleting a missing file is not an error', async () => {
    await storage.put('a.bin', Buffer.from('x'));
    await storage.delete('a.bin');
    await expect(stat(join(dir, 'a.bin'))).rejects.toThrow();
    await expect(storage.delete('a.bin')).resolves.toBeUndefined();
  });

  it.each(['../escape.bin', '/etc/passwd', 'a/../../escape.bin', '..'])(
    'refuses a key that leaves the folder: %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(
        /Invalid storage key/,
      );
      await expect(storage.read(key)).rejects.toThrow(/Invalid storage key/);
    },
  );
});
