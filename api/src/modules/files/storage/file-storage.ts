import type { Readable } from 'node:stream';

/**
 * Where file bytes are kept. Development uses the local disk; production will
 * use S3-compatible storage behind this same interface, so nothing else changes.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  /** A stream of the stored bytes. Throws if the key does not exist. */
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
