import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

/** A plain, harmless PDF with the given number of pages. */
export async function makePdf(
  pages = 1,
  opts: {
    objectStreams?: boolean;
    onCatalog?: (doc: PDFDocument) => void;
  } = {},
) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]).drawText(`Page ${i}`);
  opts.onCatalog?.(doc);
  return Buffer.from(
    await doc.save({ useObjectStreams: opts.objectStreams ?? false }),
  );
}

/** Makes the PDF run JavaScript when it is opened. */
export const withJavaScript = (doc: PDFDocument) => {
  const action = doc.context.obj({
    S: 'JavaScript',
    JS: PDFString.of('app.alert("hello")'),
  });
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(action));
};
