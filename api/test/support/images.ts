import sharp from 'sharp';

/** A real, decodable picture for tests. */
export const makeImage = (
  format: 'jpeg' | 'png' | 'webp',
  width = 8,
  height = 8,
  withMetadata?: Record<string, Record<string, string>>,
) => {
  let img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  });
  if (withMetadata) img = img.withExif(withMetadata);
  return img[format]().toBuffer();
};
