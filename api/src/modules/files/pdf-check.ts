import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFObject,
} from 'pdf-lib';

/** Thrown with a reason a person can read. */
export class UnsafePdfError extends Error {}

/**
 * Parts of a PDF that can run code, open other files or addresses, or hide other
 * files inside. A scanned certificate needs none of them.
 */
const FORBIDDEN_KEYS = [
  'JS',
  'JavaScript',
  'Launch',
  'OpenAction',
  'AA',
  'EmbeddedFile',
  'EmbeddedFiles',
  'FileAttachment',
  'RichMedia',
  'XFA',
  'SubmitForm',
  'ImportData',
  'GoToR',
  'GoToE',
  'URI',
  'Movie',
  'Sound',
  'Encrypt',
];
const FORBIDDEN = new Set(FORBIDDEN_KEYS.map((k) => `/${k}`));

/** The most pages a stored paper may have: a scan of a certificate is a few pages. */
const MAX_PAGES = 50;

/**
 * Decides whether a PDF is safe to keep on a student's record. It looks at the file's
 * real structure (including objects packed inside compressed streams, and names written
 * with #-escapes), not just its text, and refuses anything that can run code or reach
 * outside the file. This is a structural check, not a virus scanner: before launch, run
 * uploads through a scanner such as ClamAV as well.
 *
 * The file is stored exactly as uploaded when it passes; it is never rewritten.
 */
export async function checkPdf(data: Buffer): Promise<void> {
  // The signature must be at the very start (browsers tolerate a little junk before it;
  // we do not, so nothing can be prepended to make another file type).
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new UnsafePdfError('This is not a PDF file');
  }

  let doc: PDFDocument;
  try {
    // Encrypted files are refused rather than opened, because their contents cannot be checked.
    doc = await PDFDocument.load(data, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch {
    throw new UnsafePdfError(
      'This PDF could not be read. It may be damaged or password-protected',
    );
  }

  let pages: number;
  try {
    pages = doc.getPageCount();
  } catch {
    throw new UnsafePdfError('This PDF has no pages, or is damaged');
  }
  if (pages > MAX_PAGES) {
    throw new UnsafePdfError(`A PDF here may have at most ${MAX_PAGES} pages`);
  }

  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const found = firstForbidden(object, new Set());
    if (found) {
      throw new UnsafePdfError(
        `This PDF contains ${found.slice(1)}, which is not allowed. Save or scan it as a plain PDF`,
      );
    }
  }
}

/** The first forbidden name found in this object or anything inside it (not following references). */
function firstForbidden(
  object: PDFObject | undefined,
  seen: Set<PDFObject>,
): string | null {
  if (!object || seen.has(object)) return null;
  seen.add(object);

  let dict: PDFDict | undefined;
  if (object instanceof PDFDict) dict = object;
  else if (object instanceof PDFRawStream) dict = object.dict;
  else if (object instanceof PDFArray) {
    for (const item of object.asArray()) {
      const hit = firstForbidden(item, seen);
      if (hit) return hit;
    }
    return null;
  }
  if (!dict) return null;

  for (const [key, value] of dict.entries()) {
    // pdf-lib decodes #-escapes in names, so /J#53 is seen as /JS here.
    const name = key.decodeText();
    if (FORBIDDEN.has(`/${name}`) || FORBIDDEN.has(key.asString())) {
      return `/${name}`;
    }
    // A forbidden name used as a value, e.g. /S /JavaScript or /S /Launch.
    if (value instanceof PDFName && FORBIDDEN.has(value.asString())) {
      return value.asString();
    }
    const hit = firstForbidden(value, seen);
    if (hit) return hit;
  }
  return null;
}
