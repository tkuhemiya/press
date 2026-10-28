import { targetName, type Direction, type NodeId } from '../model.ts';
import type { Document, Figure } from '../parse/document.ts';
import { documentBlocks, htmlInlines, plain, type Blocks, type Inline } from './blocks.ts';
import { view, type RenderContext, type Rendered, type View } from '../diagrams/diagram.ts';
import { printScene, type PrintScene } from '../scene/print.ts';

type Block = Blocks<FigureBlock>;

interface FigureBlock {
  t: 'figure';
  key: string;
  title?: string;
  variants: Variant[];
  steps: Inline[][];
  kind: string;
}

interface Variant {
  scene: PrintScene;
  fit: number;
  beside: boolean;
}

interface Section {
  heading?: Block;
  title?: string;
  blocks: Block[];
  keep: boolean;
  fresh: boolean;
}

export interface TypstDocument {
  title?: string;
  scale: number;
  sections: Section[];
}

const PT_PER_PX = 0.62;
const PAGE_W = ((210 - 34) / 25.4) * 72;
const PAGE_H = ((297 - 38) / 25.4) * 72 * 0.6;
const DIRECTIONS: Direction[] = ['right', 'down'];

export function typstDocument(doc: Document): TypstDocument {
  const blocks = documentBlocks(doc, figure);
  const out: TypstDocument = { scale: PT_PER_PX, sections: sectionsOf(blocks) };
  if (doc.title !== undefined) out.title = doc.title;
  return out;
}

function sectionsOf(blocks: Block[]): Section[] {
  return blocks.reduce<Section[]>((out, b) => {
    if (b.t === 'heading')
      return [...out, { heading: b, title: plain(b.c), blocks: [], keep: b.page === 'keep', fresh: b.page === 'new' }];
    const last = out.at(-1);
    if (last === undefined) return [{ blocks: [b], keep: false, fresh: false }];
    return [...out.slice(0, -1), { ...last, blocks: [...last.blocks, b] }];
  }, []);
}

function draw(v: View, f: Figure, direction?: Direction): Rendered {
  const markers = new Map(f.refs.map((r) => [targetName(r.target), r.marker]));
  const context: RenderContext = { domId: `${f.domId}-print`, marker: (t) => markers.get(targetName(t)) };
  if (direction !== undefined) context.direction = direction;
  return v.render(context);
}

const fitOf = (r: Rendered): number => Math.min(1, PAGE_W / (r.width * PT_PER_PX), PAGE_H / (r.height * PT_PER_PX));

const variantOf = (r: Rendered): Variant => ({
  scene: printScene(r.scene),
  fit: fitOf(r),
  beside: r.width * PT_PER_PX * fitOf(r) <= PAGE_W * 0.6,
});

const sameSize = (a: Rendered, b: Rendered): boolean => a.width === b.width && a.height === b.height;

const distinct = (renders: Rendered[]): Rendered[] =>
  renders.reduce<Rendered[]>((kept, r) => (kept.some((k) => sameSize(k, r)) ? kept : [...kept, r]), []);

const pinnedBy =
  (f: Figure) =>
  (id: NodeId): boolean =>
    f.refs.some(
      (r) => (r.target.type === 'node' && r.target.id === id) || (r.target.type === 'prop' && r.target.node === id),
    );

const onEdges = (f: Figure): boolean => f.refs.some((r) => r.target.type === 'edge' || r.target.type === 'edges');

function leanOf(v: View, f: Figure): Rendered | undefined {
  const lean = onEdges(f) ? undefined : v.withoutMuted(pinnedBy(f));
  if (!lean) return undefined;
  const leanView = view(lean);
  const directions: (Direction | undefined)[] = v.turnable() ? DIRECTIONS : [undefined];
  const renders = directions.flatMap((d) => {
    try {
      return [draw(leanView, f, d)];
    } catch {
      return [];
    }
  });
  return renders.reduce<Rendered | undefined>((a, b) => (a === undefined || fitOf(b) > fitOf(a) ? b : a), undefined);
}

function figure(f: Figure): Block {
  const v = view(f.diagram);
  const first = draw(v, f);
  const tried = v.turnable() ? [first, ...DIRECTIONS.map((d) => draw(v, f, d))] : [first];
  const best = tried.reduce((a, b) => (fitOf(b) > fitOf(a) * 1.1 ? b : a));
  const lean = leanOf(v, f);
  const leaned = lean && fitOf(lean) * 0.85 > fitOf(best) * 1.15 ? [lean] : [];
  const block: Block = {
    t: 'figure',
    key: f.domId,
    kind: f.diagram.type,
    variants: distinct([best, ...tried, ...leaned]).map(variantOf),
    steps: f.diagram.steps.map((s) => htmlInlines(s.caption)),
  };
  if (f.diagram.title !== undefined) block.title = f.diagram.title;
  return block;
}
