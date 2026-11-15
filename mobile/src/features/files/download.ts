/**
 * Downloading a private file (a receipt PDF, a worksheet) with the account's token, then handing
 * it to the phone's share sheet (open in a viewer, save to Files, send). The copy is kept in the
 * app's cache folder only while the share sheet is open and is deleted afterwards.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, ApiError } from '@/api';
import type { QueryValue } from '@/api/client';
import { safeFileName } from './file-names';

export interface DownloadRequest {
  /** API path such as `/payments/<id>/receipt` (without the `/api/v1` prefix). */
  path: string;
  query?: Record<string, QueryValue>;
  /** The name the file gets on the phone. */
  fileName: string;
  mimeType: string;
}

/** Downloads the file to the cache folder and returns it. */
export async function downloadToCache({ path, query, fileName }: DownloadRequest): Promise<File> {
  const folder = new Directory(Paths.cache, 'downloads');
  if (!folder.exists) folder.create({ intermediates: true });
  const target = new File(folder, `${Date.now()}-${safeFileName(fileName)}`);
  try {
    return await File.downloadFileAsync(api.url(path, query), target, {
      headers: api.authHeaders(),
      idempotent: true,
    });
  } catch {
    throw new ApiError(0, 'network', 'The file could not be downloaded. Check your connection and try again.');
  }
}

/** Downloads a file and opens the share sheet for it. Resolves when the sheet is closed. */
export async function downloadAndShare(request: DownloadRequest): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError(0, 'unknown', 'This phone cannot open or share files from the app.');
  }
  const file = await downloadToCache(request);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: request.mimeType,
      UTI: request.mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
      dialogTitle: request.fileName,
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // The cache folder is cleared by the system anyway.
    }
  }
}
