import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { FileStorage } from './file-storage.js';

export interface S3Settings {
  bucket: string;
  region: string;
  /** Leave empty for AWS. Set it for R2, MinIO and other S3-compatible services. */
  endpoint?: string;
  /** Leave both keys empty on AWS to use the server's IAM role. */
  accessKeyId?: string;
  secretAccessKey?: string;
  /** MinIO and some other services need bucket-in-the-path addressing. */
  forcePathStyle?: boolean;
  /** Everything is stored under this folder-like prefix, for example "school-erp/". */
  keyPrefix?: string;
}

/**
 * File bytes in an S3-compatible bucket. The bucket stays private: files are
 * only ever served through the API, which checks who may see each one.
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(settings: S3Settings, client?: S3Client) {
    this.bucket = settings.bucket;
    this.prefix = settings.keyPrefix ?? '';
    this.client =
      client ??
      new S3Client({
        region: settings.region,
        ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
        ...(settings.forcePathStyle ? { forcePathStyle: true } : {}),
        ...(settings.accessKeyId && settings.secretAccessKey
          ? {
              credentials: {
                accessKeyId: settings.accessKeyId,
                secretAccessKey: settings.secretAccessKey,
              },
            }
          : {}),
        // Newer SDKs add checksum headers by default, which several S3-compatible
        // services reject. Only send them when the service requires them.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async put(key: string, data: Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keyFor(key),
        Body: data,
        ContentLength: data.length,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async read(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }),
    );
    if (!result.Body) throw new Error(`Empty response for ${key}`);
    return result.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }),
    );
  }

  /** Keys are made by us, but one must never be able to point outside the prefix. */
  private keyFor(key: string): string {
    if (!key || key.startsWith('/') || key.split('/').includes('..')) {
      throw new Error('Invalid storage key');
    }
    return this.prefix + key;
  }
}
