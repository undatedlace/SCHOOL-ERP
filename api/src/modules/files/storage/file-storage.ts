import type { Readable } from 'node:stream';

/**
 * Where file bytes are kept. Development uses the local disk; production uses
 * S3-compatible storage (AWS S3, Cloudflare R2, MinIO...) behind this same
 * interface, so nothing else changes. The driver is chosen by FILES_DRIVER.
 */
export interface FileStorage {
  /** Stores the bytes under the key. The content type is kept where the storage supports it. */
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  /** A stream of the stored bytes. Throws if the key does not exist. */
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
