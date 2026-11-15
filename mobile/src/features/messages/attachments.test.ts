jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-image-picker', () => ({}));

import { attachmentProblem, mimeFromName } from './attachments';

describe('attachmentProblem', () => {
  it('accepts photos and PDFs under 10 MB', () => {
    expect(attachmentProblem({ mimeType: 'image/jpeg', sizeBytes: 2_000_000 }, 0)).toBeNull();
    expect(attachmentProblem({ mimeType: 'application/pdf', sizeBytes: null }, 2)).toBeNull();
  });
  it('refuses a fourth file', () => {
    expect(attachmentProblem({ mimeType: 'image/png', sizeBytes: 10 }, 3)).toMatch(/up to 3 files/);
  });
  it('refuses other types and big files', () => {
    expect(attachmentProblem({ mimeType: 'image/gif', sizeBytes: 10 }, 0)).toMatch(/photos .* and PDF/);
    expect(attachmentProblem({ mimeType: 'image/heic', sizeBytes: 10 }, 0)).not.toBeNull();
    expect(attachmentProblem({ mimeType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 }, 0)).toMatch(/10 MB/);
  });
});

describe('mimeFromName', () => {
  it('reads the type from the extension', () => {
    expect(mimeFromName('Scan.PDF')).toBe('application/pdf');
    expect(mimeFromName('a.b.jpeg')).toBe('image/jpeg');
    expect(mimeFromName('notes.txt')).toBeNull();
  });
});
