import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OcrResult } from './ocr-mapping.js';

export interface Photo {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/** A form on half a CPU can take a while; the browser waits for it. */
const TIMEOUT_MS = 180_000;

/**
 * Talks to the Python OCR service (ocr-service/, FastAPI) over the private
 * network. Set OCR_SERVICE_URL (and OCR_SERVICE_TOKEN if the service needs one).
 */
@Injectable()
export class OcrClient {
  private readonly log = new Logger(OcrClient.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return !!this.config.get<string>('OCR_SERVICE_URL');
  }

  async extract(photos: Photo[]): Promise<OcrResult> {
    const base = this.config.get<string>('OCR_SERVICE_URL');
    if (!base) {
      throw new ServiceUnavailableException(
        'Reading forms from photos is not set up on this server',
      );
    }
    const body = new FormData();
    for (const p of photos) {
      body.append(
        'files',
        new Blob([new Uint8Array(p.buffer)], { type: p.mimetype }),
        p.originalname,
      );
    }
    const token = this.config.get<string>('OCR_SERVICE_TOKEN');
    let res: Response;
    try {
      res = await fetch(new URL('/extract', base), {
        method: 'POST',
        body,
        headers: token ? { 'X-OCR-Token': token } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      this.log.warn(`OCR service unreachable: ${(e as Error).message}`);
      throw new BadGatewayException(
        'The form reader is not answering. Try again in a minute.',
      );
    }
    if (res.status === 400 || res.status === 413) {
      const detail = (
        (await res.json().catch(() => ({}))) as { detail?: string }
      ).detail;
      throw new BadRequestException(detail ?? 'The photos could not be read');
    }
    if (!res.ok) {
      this.log.warn(`OCR service answered ${res.status}`);
      throw new BadGatewayException(
        'The form reader failed. Try again in a minute.',
      );
    }
    return (await res.json()) as OcrResult;
  }
}
