import { extensionFor, fileNameFor, safeFileName } from './file-names';

describe('extensionFor', () => {
  it('knows the types the API accepts', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('IMAGE/PNG')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });

  it('returns null for anything else', () => {
    expect(extensionFor('image/heic')).toBeNull();
    expect(extensionFor('text/html')).toBeNull();
  });
});

describe('fileNameFor', () => {
  it('makes the extension match the type', () => {
    expect(fileNameFor('IMG_0042.HEIC', 'image/jpeg')).toBe('IMG_0042.jpg');
    expect(fileNameFor('worksheet', 'application/pdf')).toBe('worksheet.pdf');
    expect(fileNameFor('notes.pdf', 'application/pdf')).toBe('notes.pdf');
  });

  it('removes folders from the name', () => {
    expect(fileNameFor('/var/mobile/tmp/photo.png', 'image/png')).toBe('photo.png');
    expect(fileNameFor('..\\..\\evil.pdf', 'application/pdf')).toBe('evil.pdf');
  });

  it('names an unnamed photo or document', () => {
    expect(fileNameFor(null, 'image/jpeg')).toBe('photo.jpg');
    expect(fileNameFor('', 'application/pdf')).toBe('document.pdf');
  });
});

describe('safeFileName', () => {
  it('keeps ordinary names', () => {
    expect(safeFileName('receipt 2026-27.pdf')).toBe('receipt 2026-27.pdf');
  });

  it('strips folders, leading dots and odd characters', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('a<b>c?.pdf')).toBe('a_b_c_.pdf');
  });

  it('falls back when nothing is left', () => {
    expect(safeFileName('')).toBe('file');
    expect(safeFileName(null, 'receipt.pdf')).toBe('receipt.pdf');
    expect(safeFileName('...')).toBe('file');
  });
});
