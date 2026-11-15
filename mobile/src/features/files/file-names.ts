/** Names and types of files, as plain functions (no phone modules), so they can be tested. */

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** What the API accepts for a hand-in or an attachment. */
export const UPLOAD_MIME_TYPES = Object.keys(EXTENSION_BY_MIME);

export function extensionFor(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? null;
}

/**
 * A name that ends in the extension that matches the type ("IMG_0042.HEIC" sent as image/jpeg
 * becomes "IMG_0042.jpg"), with no folders in it. A missing name becomes "photo" or "document".
 */
export function fileNameFor(name: string | null | undefined, mimeType: string): string {
  const ext = extensionFor(mimeType);
  const base = (name ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, '') || (mimeType.startsWith('image/') ? 'photo' : 'document');
  return ext ? `${stem}.${ext}` : base || stem;
}

/** A name that is safe to write to disk: no folders, no odd characters, never empty. */
export function safeFileName(name: string | null | undefined, fallback = 'file'): string {
  const cleaned = (name ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

