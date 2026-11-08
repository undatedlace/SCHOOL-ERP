import sharp from 'sharp';
import type { ImageType } from './image-sniff.js';

/** The longest side a stored photograph keeps. A passport-style photo needs far less. */
export const MAX_IMAGE_SIDE = 1600;
/** Refuse images that decode to more pixels than this (a tiny file can hide a huge picture). */
const MAX_INPUT_PIXELS = 40_000_000;

/** Thrown when the bytes look like an image but cannot be decoded. */
export class UnreadableImageError extends Error {}

/**
 * Re-encodes an uploaded photograph, so what is stored is only the picture:
 *  - all metadata is dropped, including camera make and GPS location;
 *  - the picture is turned upright, as the camera's orientation tag says;
 *  - it is shrunk to fit within 1600 pixels (never enlarged);
 *  - anything that is not a real, decodable image is refused, so nothing hidden
 *    after the picture (or in an odd header) is kept.
 * The format stays the same (JPEG, PNG or WebP).
 */
export async function cleanImage(
  data: Buffer,
  type: ImageType,
): Promise<Buffer> {
  try {
    const picture = sharp(data, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: MAX_IMAGE_SIDE,
        height: MAX_IMAGE_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb');

    switch (type.mime) {
      case 'image/jpeg':
        return await picture.jpeg({ quality: 85 }).toBuffer();
      case 'image/png':
        return await picture.png({ compressionLevel: 9 }).toBuffer();
      case 'image/webp':
        return await picture.webp({ quality: 85 }).toBuffer();
    }
  } catch {
    throw new UnreadableImageError('The image could not be read');
  }
}
