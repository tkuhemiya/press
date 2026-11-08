import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { pngToJpeg, pngToWebp } from '../src/render/encode.ts';

function samplePng(): Buffer {
  const image = new PNG({ width: 4, height: 4 });
  image.data.fill(255);
  return PNG.sync.write(image);
}

describe('raster encode', () => {
  it('encodes lossless WebP from PNG bytes', async () => {
    const webp = await pngToWebp(samplePng());
    expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('encodes JPEG from PNG bytes', () => {
    const jpg = pngToJpeg(samplePng());
    expect(jpg.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });
});
