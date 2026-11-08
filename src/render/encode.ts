import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { rgbaToWebp } from './webp.js';

function rgba(png: Buffer): { data: Uint8ClampedArray; width: number; height: number } {
  const image = PNG.sync.read(png);
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

export async function pngToWebp(png: Buffer): Promise<Buffer> {
  const image = rgba(png);
  return rgbaToWebp(image.data, image.width, image.height);
}

export function pngToJpeg(png: Buffer): Buffer {
  return jpeg.encode(rgba(png), 90).data;
}
