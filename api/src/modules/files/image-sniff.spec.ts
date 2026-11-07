import { sniffImage } from './image-sniff.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

describe('sniffImage', () => {
  it('recognises PNG, JPEG and WebP by their headers', () => {
    expect(sniffImage(png)).toEqual({ mime: 'image/png', ext: 'png' });
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
    expect(
      sniffImage(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.from([0, 0, 0, 0]),
          Buffer.from('WEBPVP8 '),
        ]),
      ),
    ).toEqual({
      mime: 'image/webp',
      ext: 'webp',
    });
  });

  it.each([
    ['text', Buffer.from('hello world, not an image')],
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', Buffer.from('GIF89a......')],
    ['PDF', Buffer.from('%PDF-1.7 ...')],
    ['empty', Buffer.alloc(0)],
    ['truncated PNG', Buffer.from([0x89, 0x50, 0x4e])],
    [
      'RIFF but not WebP',
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVEfmt '),
      ]),
    ],
  ])('rejects %s', (_name, data) => {
    expect(sniffImage(data)).toBeNull();
  });
});
