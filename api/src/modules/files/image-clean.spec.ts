import sharp from 'sharp';
import { makeImage } from '../../../test/support/images.js';
import {
  cleanImage,
  MAX_IMAGE_SIDE,
  UnreadableImageError,
} from './image-clean.js';
import { sniffImage } from './image-sniff.js';

const clean = (data: Buffer) => cleanImage(data, sniffImage(data)!);
const exif = {
  IFD0: { Copyright: 'SECRET-OWNER', Make: 'SECRET-CAMERA' },
  IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
};

describe('cleanImage', () => {
  it('removes camera and location data', async () => {
    const photo = await makeImage('jpeg', 40, 40, exif);
    expect(photo.toString('latin1')).toContain('SECRET-OWNER');
    const out = await clean(photo);
    expect(out.toString('latin1')).not.toContain('SECRET');
    expect((await sharp(out).metadata()).exif).toBeUndefined();
  });

  it('turns a sideways photo upright', async () => {
    const photo = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#888' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await clean(photo)).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect(meta.orientation).toBeUndefined();
  });

  it('shrinks a big picture to fit, and never enlarges a small one', async () => {
    const big = await makeImage('png', 3200, 2000);
    const meta = await sharp(await clean(big)).metadata();
    expect([meta.width, meta.height]).toEqual([MAX_IMAGE_SIDE, 1000]);
    const small = await sharp(
      await clean(await makeImage('webp', 50, 30)),
    ).metadata();
    expect([small.width, small.height]).toEqual([50, 30]);
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'keeps the %s format',
    async (f) => {
      const out = await clean(await makeImage(f));
      expect(sniffImage(out)?.mime).toBe(`image/${f}`);
    },
  );

  it('drops anything hidden after the picture', async () => {
    const png = await makeImage('png');
    const out = await clean(
      Buffer.concat([png, Buffer.from('<script>HIDDEN</script>')]),
    );
    expect(out.toString('latin1')).not.toContain('HIDDEN');
  });

  it('refuses files that only look like images', async () => {
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64),
    ]);
    await expect(clean(fake)).rejects.toBeInstanceOf(UnreadableImageError);
    const truncated = (await makeImage('png', 64, 64)).subarray(0, 40);
    await expect(clean(truncated)).rejects.toBeInstanceOf(UnreadableImageError);
  });
});
