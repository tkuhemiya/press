import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import encode, { init } from '@jsquash/webp/encode.js';

const require = createRequire(import.meta.url);

let ready;

function load() {
  ready ??= (async () => {
    const wasm = await WebAssembly.compile(readFileSync(require.resolve('@jsquash/webp/codec/enc/webp_enc.wasm')));
    await init(wasm);
  })();
  return ready;
}

export async function rgbaToWebp(data, width, height) {
  await load();
  const encoded = await encode({ data, width, height }, { lossless: true });
  return Buffer.from(encoded);
}
