import { PDFName } from 'pdf-lib';
import { makePdf, withJavaScript } from '../../../test/support/pdfs.js';
import { checkPdf, UnsafePdfError } from './pdf-check.js';

const refuses = (data: Buffer, message?: RegExp) =>
  expect(checkPdf(data)).rejects.toSatisfy(
    (e: unknown) =>
      e instanceof UnsafePdfError && (!message || message.test(e.message)),
  );

describe('checkPdf', () => {
  it('accepts a plain PDF, with or without compressed object streams', async () => {
    await expect(checkPdf(await makePdf(2))).resolves.toBeUndefined();
    await expect(
      checkPdf(await makePdf(2, { objectStreams: true })),
    ).resolves.toBeUndefined();
  });

  it('refuses a PDF that runs JavaScript when opened', async () => {
    await refuses(
      await makePdf(1, { onCatalog: withJavaScript }),
      /JavaScript|JS|OpenAction/,
    );
  });

  it('still finds it when the PDF packs its objects into compressed streams', async () => {
    await refuses(
      await makePdf(1, { objectStreams: true, onCatalog: withJavaScript }),
    );
  });

  it('still finds it when the name is written with # escapes', async () => {
    const pdf = await makePdf(1, { onCatalog: withJavaScript });
    const text = pdf.toString('latin1');
    expect(text).toContain('/JS ');
    const sneaky = Buffer.from(
      text
        .replaceAll('/JS ', '/J#53 ')
        .replaceAll('/OpenAction', '/Open#41ction'),
      'latin1',
    );
    await refuses(sneaky);
  });

  it('refuses a PDF with a launch action, a web address, or an attached file', async () => {
    for (const key of ['Launch', 'URI', 'EmbeddedFiles']) {
      const pdf = await makePdf(1, {
        onCatalog: (doc) =>
          doc.catalog.set(PDFName.of(key), doc.context.obj({ X: 1 })),
      });
      await refuses(pdf, new RegExp(key));
    }
  });

  it('refuses a file that is not a PDF, or has something in front of the signature', async () => {
    await refuses(Buffer.from('<html><script>1</script></html>'));
    await refuses(Buffer.concat([Buffer.from('GIF89a'), await makePdf()]));
    await refuses(Buffer.concat([Buffer.from('\n'), await makePdf()]));
  });

  it('refuses damaged files', async () => {
    const pdf = await makePdf(1);
    await refuses(pdf.subarray(0, Math.floor(pdf.length / 2)));
    await refuses(Buffer.from('%PDF-1.7\nnot really'));
  });

  it('refuses a PDF with too many pages', async () => {
    await refuses(await makePdf(51), /at most 50 pages/);
  });
});
