import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Diagram, type DiagramType, type Document } from '../src/index.ts';
import { signed } from '../src/diagrams/sign.ts';

const fence = (body: string, header = '') => `# Doc\n\n\`\`\`timeline${header ? ' ' + header : ''}\n${body}\n\`\`\`\n`;
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = <T extends DiagramType>(doc: Document, type: T): Diagram<T> => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, type)) throw new Error(`expected a ${type}`);
  return d;
};
const statuses = (items: readonly { id: string; change?: string }[]) =>
  Object.fromEntries(items.map((item) => [item.id, item.change ?? 'kept']));
const pageOf = (body: string): string => {
  const { html, diagnostics } = build(fence(body), { embedFonts: false });
  expect(diagnostics).toEqual([]);
  return html;
};
const svgOf = (body: string): string => {
  const html = pageOf(body);
  return html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
};
const paneOf = (body: string, side: 'before' | 'after'): string => {
  const html = pageOf(body);
  const at = html.indexOf(`data-side="${side}"`);
  return at < 0 ? '' : html.slice(at, html.indexOf('</svg>', at) + 6);
};
const opening = (svg: string, marker: string): string => {
  const at = svg.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker} in the svg`);
  const start = svg.lastIndexOf('<g ', at);
  return svg.slice(start, svg.indexOf('>', start) + 1);
};

const shownNotes = (d: Diagram): Map<string, string | undefined> => {
  const shown = signed(d);
  return new Map('nodes' in shown ? shown.nodes.map((n) => [n.id, n.note]) : []);
};

describe('timeline diff marks', () => {
  const events = `14:02 deploy: "v2.3 rolls out"
14:05 alerts: "Error rate hits 8%" {role=error}
- 14:10 rollback: "Roll back"
- 14:12 freeze: "Deploys frozen" {until=14:30}
+ 14:16 rollback: "Roll back to v2.2" {role=error}
+ 14:24 recovered: "Errors back to baseline" {role=happy}
- 14:33 page: "Page the database team"`;

  it('marks each event by its status and keeps the hooks the viewer uses', () => {
    const d = first(parseDocument(fence(events)), 'timeline');
    expect(statuses(d.nodes)).toEqual({
      deploy: 'kept',
      alerts: 'kept',
      rollback: 'changed',
      freeze: 'removed',
      recovered: 'added',
      page: 'removed',
    });
    const before = paneOf(events, 'before');
    const after = paneOf(events, 'after');
    expect(before).toContain('Roll back');
    expect(before).not.toContain('v2.2');
    expect(after).toContain('Roll back to v2.2');
    expect(opening(after, 'data-node="rollback"')).toMatch(/ id="[^"]*-node-rollback"/);
    expect(opening(before, 'data-node="rollback"')).toContain('data-change="removed"');
    expect(opening(after, 'data-node="rollback"')).toContain('data-change="added"');
    expect(opening(after, 'data-node="rollback"')).toContain('data-role="error"');
    expect(before).toContain('data-node="page"');
    expect(after).not.toContain('data-node="page"');
    expect(after).toContain('data-node="recovered"');
    expect(before).not.toContain('data-node="recovered"');
    expect(opening(after, 'data-node="recovered"')).toContain('data-change="added"');
    expect(opening(before, 'data-node="page"')).toContain('data-change="removed"');
    expect(opening(before, 'data-node="deploy"')).not.toContain('data-change');
    expect(opening(before, 'data-node="alerts"')).toContain('data-role="error"');
  });

  it('shows the old time of a moved event in its note, and the old label only when the time held', () => {
    const d = first(
      parseDocument(
        fence(`14:00 start: "Start"
- 14:10 rollback: "Roll back"
+ 14:16 rollback: "Roll back to v2.2" {note="by hand"}
- 14:20 a: "Old label"
+ 14:20 a: "New label"
- 14:30 b: "Same"
+ 14:30 b: "Same" {role=error}`),
      ),
      'timeline',
    );
    const note = (id: string) => shownNotes(d).get(id);
    expect(note('rollback')).toBe('by hand · was 14:10 · was "Roll back"');
    expect(note('a')).toBe('was "Old label"');
    expect(note('b')).toBeUndefined();
  });

  it('marks changed, added and removed events in an undated timeline, with no times', () => {
    const body = `browse: "Browse the catalogue"
- submit: "Submit the form"
+ submit: "Submit the order"
+ review: "Review the order"
- confirm: "Confirmation e-mail"
pay: "Pay"

browse -> submit
+ review -> pay : approves`;
    const d = first(parseDocument(fence(body)), 'timeline');
    expect(d.dating).toBe('undated');
    expect(statuses(d.nodes)).toEqual({
      browse: 'kept',
      submit: 'changed',
      review: 'added',
      confirm: 'removed',
      pay: 'kept',
    });
    expect(shownNotes(d).get('submit')).toBe('was "Submit the form"');
    const before = paneOf(body, 'before');
    const after = paneOf(body, 'after');
    expect(before).toContain('Submit the form');
    expect(after).toContain('Submit the order');
    expect(before).toContain('data-node="confirm"');
    expect(after).not.toContain('data-node="confirm"');
    expect(after).toContain('data-node="review"');
    expect(before).not.toContain('data-node="review"');
    expect(after).toContain('data-to="pay"');
    expect(before).not.toContain('data-to="pay"');
    expect(before).not.toContain('class="pr-when"');
    expect(after).not.toContain('class="pr-when"');
  });

  it('marks an added lane and a removed lane from their events, and leaves a mixed lane unmarked', () => {
    const body = `lane "Server A" {
  14:02 deploy_a: "Deploy to A"
  + 14:09 errors_a: "Errors on A"
}
lane "Server B" {
  + 14:04 canary: "Canary on B"
  + 14:12 wait_b: "Waiting on B" {until=14:18}
}
lane "Old queue" {
  - 14:06 drain: "Drain the old queue"
  - 14:14 retire: "Retire the queue"
}
+ deploy_a -> canary : same build`;
    const d = first(parseDocument(fence(body)), 'timeline');
    expect(statuses(d.lanes.map((l) => ({ id: l.label, change: l.change })))).toEqual({
      'Server A': 'kept',
      'Server B': 'added',
      'Old queue': 'removed',
    });
    const before = paneOf(body, 'before');
    const after = paneOf(body, 'after');
    expect(before).toContain('>Server A</text>');
    expect(after).toContain('>Server B</text>');
    expect(before).toContain('>Old queue</text>');
    expect(after).not.toContain('>Old queue</text>');
    expect(before).not.toContain('>Server B</text>');
    expect(after).toContain('data-node="canary"');
    expect(before).not.toContain('data-node="canary"');
  });

  it('marks added and removed edges, and their labels', () => {
    const body = `14:00 a: "A"
14:05 b: "B"
14:09 c: "C"
+ a -> c : caused
- b -> c : followed`;
    const d = first(parseDocument(fence(body)), 'timeline');
    expect(d.edges.map((e) => [e.from, e.to, e.change])).toEqual([
      ['a', 'c', 'added'],
      ['b', 'c', 'removed'],
    ]);
    const before = paneOf(body, 'before');
    const after = paneOf(body, 'after');
    expect(after).toContain('data-from="a"');
    expect(before).not.toContain('data-from="a"');
    expect(before).toContain('data-from="b"');
    expect(after).not.toContain('data-from="b"');
  });

  it('marks a group window and a span where they are drawn, from their members', () => {
    const body = `14:00 start: "Start"
- 14:02 old_1: "Old step one" {until=14:05}
+ 14:08 retry_1: "Retry one"
14:12 done: "Done"

group "Old steps" {
  - old_1
}
group "New retries" {
  + retry_1
}`;
    const before = paneOf(body, 'before');
    const after = paneOf(body, 'after');
    expect(before).toContain('>Old steps</text>');
    expect(after).toContain('>New retries</text>');
    expect(after).not.toContain('>Old steps</text>');
    expect(before).not.toContain('>New retries</text>');
    expect(before).toContain('data-node="old_1"');
    expect(before).toContain('class="pr-span"');
  });

  it('draws a timeline with no changes exactly as before, with no data-change anywhere', () => {
    const body = `14:02 deploy: "v2.3 rolls out" {until=14:20}
14:09 alerts: "Error rate hits 8%" {role=error}
14:15 rollback: "Rollback starts"
14:21 recovered: "Errors back to baseline" {role=happy}

group "Impact" {
  alerts
  rollback
}
deploy -> alerts : caused`;
    const d = first(parseDocument(fence(body)), 'timeline');
    expect(d.nodes.every((n) => n.change === undefined && n.note === undefined)).toBe(true);
    expect(d.groups[0]?.change).toBeUndefined();
    expect(svgOf(body)).not.toContain('data-change');
  });

  it('marks an added and a removed lane in an undated timeline', () => {
    const body = `lane "main" {
  init: "Initial commit"
  pin: "Pin the version"
}
lane "feature" {
  + branch: "Start the feature"
  + work: "Write the code"
}
lane "release" {
  - hotfix: "Cherry-pick the hotfix"
}
+ init -> branch : branch off
+ work -> pin : merge`;
    const d = first(parseDocument(fence(body)), 'timeline');
    expect(d.dating).toBe('undated');
    expect(statuses(d.lanes.map((l) => ({ id: l.label, change: l.change })))).toEqual({
      main: 'kept',
      feature: 'added',
      release: 'removed',
    });
    const before = paneOf(body, 'before');
    const after = paneOf(body, 'after');
    expect(before).toContain('>main</text>');
    expect(after).toContain('>feature</text>');
    expect(before).toContain('>release</text>');
    expect(after).not.toContain('>release</text>');
    expect(before).toContain('data-node="hotfix"');
    expect(after).not.toContain('data-node="hotfix"');
  });
});
