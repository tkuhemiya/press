import { CHANGES, type Change } from '../model.ts';
import { textWidth } from '../text/measure.ts';
import type { Item, Scene } from '../scene/scene.ts';
import { signedText } from './sign.ts';

const ROW = 28;
const MARGIN = 16;
const FONT = 12.5;
const GAP = 28;

const shows = (items: readonly Item[], change: Change): boolean =>
  items.some(
    (item) =>
      item.type === 'group' &&
      (item.attrs?.some(([k, v]) => k === 'data-change' && v === change) === true || shows(item.items, change)),
  );

export function withKey(scene: Scene): Scene {
  const labels = CHANGES.filter((change) => shows(scene.items, change)).map((change) => ({
    change,
    text: signedText(change, change),
  }));
  if (!labels.length) return scene;
  const cy = scene.height + ROW / 2;
  const widths = labels.map((l) => textWidth(l.text, FONT) + GAP);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const key = labels.map(({ change, text }, i): Item => ({
    type: 'group',
    attrs: [['data-change', change]],
    items: [{ type: 'lines', cls: 'pr-key pr-start', x: xs[i], cy, lines: [text], lineHeight: 16 }],
  }));
  return { ...scene, height: scene.height + ROW, items: [...scene.items, ...key] };
}
