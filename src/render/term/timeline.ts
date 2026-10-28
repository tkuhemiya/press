import type { Moment, NodeId, Time, Timeline } from '../../model.ts';
import { causalOrder, formatTime } from '../../diagrams/timeline.ts';
import { canvas, type Canvas } from './canvas.ts';
import { cellWidth } from './cells.ts';
import { wrapLine } from './flow.ts';
import type { Line, Seg } from './graph.ts';
import { errorMark, nodeLook, type Markers } from './style.ts';
import type { Theme, Token } from './theme.ts';

type Entry =
  | { type: 'event'; node: Moment; time?: string; lane: number }
  | { type: 'end'; node: Moment; time: string; lane: number }
  | { type: 'group'; g: number };

const pad2 = (n: number): string => String(n).padStart(2, '0');

function endTime(at: Time, ms: number): string {
  const value = at.value + ms;
  if (at.form === 'clock') {
    const s = Math.round(value / 1000);
    const hm = `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}`;
    return s % 60 ? `${hm}:${pad2(s % 60)}` : hm;
  }
  return formatTime({ text: '', form: at.form, value });
}

const writeLine = (c: Canvas, x: number, y: number, line: Line): void => {
  let cx = x;
  for (const s of line) {
    c.text(cx, y, s.text, s.token);
    cx += cellWidth(s.text);
  }
};

export function drawTimeline(d: Timeline, theme: Theme, mark: Markers, width: number): Canvas {
  const ascii = theme.ascii;
  const entries: Entry[] = [];
  const laneOf = (n: Moment): number => n.lane ?? 0;
  if (d.dating === 'undated') {
    for (const node of causalOrder(d)) entries.push({ type: 'event', node, lane: laneOf(node) });
  } else {
    const timed: { at: number; seq: number; entry: Entry }[] = [];
    d.nodes.forEach((node, seq) => {
      timed.push({
        at: node.at.value,
        seq,
        entry: { type: 'event', node, time: formatTime(node.at), lane: laneOf(node) },
      });
      if (node.lastsMs !== undefined)
        timed.push({
          at: node.at.value + node.lastsMs,
          seq: seq + 0.5,
          entry: { type: 'end', node, time: endTime(node.at, node.lastsMs), lane: laneOf(node) },
        });
    });
    timed.sort((a, b) => a.at - b.at || a.seq - b.seq);
    entries.push(...timed.map((t) => t.entry));
  }
  const members = (g: number): Set<NodeId> => {
    const out = new Set<NodeId>();
    for (const node of d.nodes)
      for (let at = node.group; at !== undefined; at = d.groups[at]?.parent) if (at === g) out.add(node.id);
    return out;
  };
  const groupSets = d.groups.map((_, g) => members(g));
  const withGroups: Entry[] = [];
  const opened = new Set<number>();
  for (const e of entries) {
    if (e.type === 'event')
      groupSets.forEach((set, g) => {
        if (set.has(e.node.id) && !opened.has(g)) {
          opened.add(g);
          withGroups.push({ type: 'group', g });
        }
      });
    withGroups.push(e);
  }

  const lanes = Math.max(1, d.lanes.length);
  const G = d.groups.length;
  const timeW = Math.max(
    0,
    ...withGroups.map((e) => (e.type === 'group' ? 0 : cellWidth(e.type === 'end' || e.time ? (e.time ?? '') : ''))),
  );
  const timeX = G ? 2 * G + 1 : 0;
  const trackX = (l: number): number => timeX + (timeW ? timeW + 2 : 0) + 3 * l;
  const labelX = trackX(lanes - 1) + 3;
  const labelW = Math.max(16, width - labelX);
  const label = (e: Extract<Entry, { type: 'event' }>): Line[] => {
    const look = nodeLook(e.node.role);
    const head: Seg[] =
      e.node.role === 'error'
        ? [{ text: errorMark(theme), token: 'error' }]
        : e.node.role === 'happy'
          ? [{ text: ascii ? '+ ' : '✓ ', token: 'happy' }]
          : [];
    const token: Token = look.label;
    const marks = mark({ type: 'node', id: e.node.id }).flatMap((m): Seg[] => [{ text: ' ', token: 'text' }, m]);
    const lines = wrapLine([...head, { text: e.node.label, token }, ...marks], labelW);
    if (e.node.note) lines.push(...wrapLine([{ text: e.node.note, token: 'note' }], labelW));
    for (const edge of d.edges.filter((x) => x.to === e.node.id)) {
      const src = d.nodes.find((n) => n.id === edge.from)?.label ?? edge.from;
      const em = mark({ type: 'edge', index: edge.index }).flatMap((m): Seg[] => [{ text: ' ', token: 'text' }, m]);
      lines.push(
        ...wrapLine(
          [{ text: `${ascii ? '<-' : '↖'} from “${src}”${edge.label ? `: ${edge.label}` : ''}`, token: 'note' }, ...em],
          labelW,
        ),
      );
    }
    return lines;
  };

  const c = canvas();
  const laneTop = d.lanes.length;
  d.lanes.forEach((lane, l) => {
    c.text(trackX(l), l, lane.label, 'tag');
    c.path(
      [
        { x: trackX(l), y: l + 1 },
        { x: trackX(l), y: laneTop },
      ],
      'light',
      'line',
    );
  });
  let y = laneTop + (d.lanes.length ? 1 : 0);
  const rowOf = new Map<NodeId, number>();
  const endOf = new Map<NodeId, number>();
  const groupTop = new Map<number, number>();
  const groupBottom = new Map<number, number>();
  const firstRow = new Map<number, number>();
  const lastRow = new Map<number, number>();
  const seen = (l: number, row: number): void => {
    if (!firstRow.has(l)) firstRow.set(l, row);
    lastRow.set(l, row);
  };
  for (const e of withGroups) {
    if (e.type === 'group') {
      groupTop.set(e.g, y);
      c.text(2 * e.g, y, `${ascii ? '+-' : '╭─'} ${d.groups[e.g]?.label ?? ''}`, 'group');
      y += 1;
      continue;
    }
    if (e.type === 'end') {
      c.text(timeX + timeW - cellWidth(e.time), y, e.time, 'note');
      writeLine(c, labelX, y, [{ text: `${ascii ? '' : '└ '}end of “${e.node.label}”`, token: 'note' }]);
      endOf.set(e.node.id, y);
      seen(e.lane, y);
      y += 2;
      continue;
    }
    const lines = label(e);
    const look = nodeLook(e.node.role);
    if (e.time) c.text(timeX + timeW - cellWidth(e.time), y, e.time, 'note');
    c.text(
      trackX(e.lane),
      y,
      ascii ? 'o' : e.node.role === 'focus' ? '◆' : '●',
      look.token === 'line' ? 'label' : look.token,
    );
    lines.forEach((line, i) => writeLine(c, labelX, y + i, line));
    rowOf.set(e.node.id, y);
    seen(e.lane, y);
    groupSets.forEach((set, g) => {
      if (set.has(e.node.id)) groupBottom.set(g, y + lines.length - 1);
    });
    y += lines.length + 1;
  }
  for (let l = 0; l < lanes; l++) {
    const top = d.lanes.length ? laneTop : (firstRow.get(l) ?? 0);
    const bottom = lastRow.get(l) ?? top;
    for (let row = top; row <= bottom; row++) if (c.isEmpty(trackX(l), row)) c.arms(trackX(l), row, 5, 'light', 'line');
  }
  for (const node of d.nodes) {
    const a = rowOf.get(node.id);
    const b = endOf.get(node.id);
    if (a === undefined || b === undefined) continue;
    const x = trackX(laneOf(node)) + 1;
    const token = nodeLook(node.role).token === 'line' ? 'label' : nodeLook(node.role).token;
    c.text(x, a, ascii ? '+' : '┓', token);
    for (let row = a + 1; row < b; row++) c.text(x, row, ascii ? '|' : '┃', token);
    c.text(x, b, ascii ? '+' : '┛', token);
  }
  groupTop.forEach((top, g) => {
    const bottom = (groupBottom.get(g) ?? top) + 1;
    const x = 2 * g;
    for (let row = top + 1; row < bottom; row++) c.text(x, row, ascii ? '|' : '│', 'group');
    c.text(x, bottom, ascii ? '+-' : '╰─', 'group');
  });
  return c;
}
