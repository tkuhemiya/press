import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build } from '../src/index.ts';
import { textWidth } from '../src/text/measure.ts';

const checkout = readFileSync(new URL('../docs/examples/checkout.md', import.meta.url), 'utf8');
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('html', () => {
  const { html, diagnostics } = build(checkout, { embedFonts: false });

  it('builds the example cleanly', () => {
    expect(diagnostics).toEqual([]);
  });

  it('draws each diagram once, as one figure with one svg', () => {
    expect(count(html, /<figure class="pr-figure"/g)).toBe(2);
    expect(count(html, /<svg class="pr-svg/g)).toBe(2);
  });

  it('gives every node and edge a hook for highlighting', () => {
    for (const id of ['draft', 'submitted', 'paid', 'failed', 'shipped', 'cancelled'])
      expect(html).toContain(`id="press-order-node-${id}"`);
    expect(count(html, /class="pr-edge[ "][^>]*data-edge=/g)).toBe(9 + 7);
  });

  it('carries roles as data, not colours', () => {
    expect(html).toMatch(/class="pr-edge"[^>]*data-from="submitted" data-to="paid" data-role="happy"/);
    expect(html).not.toMatch(/<svg[\s\S]*?(fill|stroke)="#[0-9a-f]{3,6}"[\s\S]*?<\/svg>/i);
  });

  it('prints steps as one numbered marker each, with a legend', () => {
    expect(count(html, /class="pr-step-marker"/g)).toBe(12);
    expect(count(html, /<ol class="pr-legend">/g)).toBe(2);
    expect(html).toContain(
      '<li><b>2</b><span>Pressing <strong>Pay</strong> submits the order and freezes the cart.</span></li>',
    );
  });

  it('marks prose references with letters on the node and in the text', () => {
    expect(html).toContain(
      '<a class="pr-ref" href="#press-order-node-failed" data-figure="press-order" data-node="failed" data-marker="a">',
    );
    expect(count(html, /class="pr-ref-marker"/g)).toBe(5);
  });

  it('allows no raw HTML through prose', () => {
    const out = build('# T\n\n<script>alert(1)</script>\n\nText <b>bold</b>\n', { embedFonts: false }).html;
    expect(out).not.toContain('<script>alert');
    expect(out).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes labels', () => {
    const out = build('```sequence\na -> b : <script> & "x"\n```\n', { embedFonts: false }).html;
    expect(out).toContain('&lt;script&gt; &amp; &quot;x&quot;');
  });

  it('renders other fences as code', () => {
    const out = build('```js\nconst a = 1 < 2;\n```\n', { embedFonts: false }).html;
    expect(out).toContain('<pre><code class="language-js">const a = 1 &lt; 2;');
  });

  it('is deterministic', () => {
    expect(build(checkout, { embedFonts: false }).html).toBe(html);
  });
});

describe('layout', () => {
  it('handles self-loops, groups, both-way edges and right-to-left flow', () => {
    const src = `\`\`\`state-machine direction=right
start -> idle
idle -> idle : tick
group "Running" {
  busy <-> waiting : wait
  busy -> busy : spin
}
idle -> busy
waiting -> end
\`\`\``;
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    expect(count(html, /class="pr-group"/g)).toBe(1);
    expect(count(html, /class="pr-head"/g)).toBe(7);
    expect(html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('sizes sequence columns to fit their labels', () => {
    const long = 'a fairly long message label';
    const { html } = build(`\`\`\`sequence\na -> b : ${long}\nb -> b : think hard about it\n\`\`\``, {
      embedFonts: false,
    });
    const xs = [...html.matchAll(/<line class="pr-lifeline" x1="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs[1] - xs[0]).toBeGreaterThan(textWidth(long, 12.5) + 30);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('keeps grouped participants together', () => {
    const { html } = build('```sequence\na -> x\ngroup "Back end" {\n  b\n  c\n}\nx -> c\nx -> b\n```', {
      embedFonts: false,
    });
    const order = [...html.matchAll(/class="pr-node pr-participant" data-node="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['a', 'x', 'b', 'c']);
  });

  it('draws architecture components with their kind, inside their boundary', () => {
    const src = readFileSync(new URL('../docs/examples/photo-uploads.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-architecture[" ]/);
    for (const kind of ['user', 'client', 'service', 'database', 'cache', 'queue', 'storage', 'external'])
      expect(svg).toMatch(new RegExp(`class="pr-node pr-component"[^>]*data-kind="${kind}"`));
    expect(count(svg, /class="pr-glyph"/g)).toBe(8);
    expect(count(svg, /class="pr-group"/g)).toBe(1);
    expect(count(svg, /class="pr-step-marker"/g)).toBe(6);
    expect(svg).toMatch(/class="pr-edge-label pr-on-group"[^>]*>.*?resize/);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('draws a timeline: events on an axis, spans, a band and a cause arc', () => {
    const src = readFileSync(new URL('../docs/examples/incident.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-timeline[" ]/);
    expect(count(svg, /class="pr-node pr-event/g)).toBe(6);
    expect(count(svg, /class="pr-span"/g)).toBe(1);
    expect(count(svg, /class="pr-group pr-band"/g)).toBe(1);
    expect(count(svg, /class="pr-edge"/g)).toBe(1);
    expect(svg).toContain('>14:02<');
    expect(svg).toContain('>14:30<');
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('never runs a timeline stem through another card', () => {
    const body = Array.from({ length: 8 }, (_, i) => `14:0${i} e${i}: "A rather long event label ${i}"`).join('\n');
    const page = build('```timeline\n' + body + '\n```', { embedFonts: false }).html;
    const html = page.slice(page.indexOf('<svg'), page.indexOf('</svg>'));
    const cards = [
      ...html.matchAll(/<rect class="pr-box" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g),
    ].map((m) => m.slice(1).map(Number));
    const stems = [...html.matchAll(/<path class="pr-stem" d="M([\d.]+),([\d.]+)V([\d.]+)"/g)].map((m) =>
      m.slice(1).map(Number),
    );
    expect(cards).toHaveLength(8);
    for (const [sx, y0, y1] of stems)
      for (const [x, y, w, h] of cards)
        expect(sx > x && sx < x + w && Math.min(y0, y1) < y && Math.max(y0, y1) > y + h).toBe(false);
  });

  it('formats calendar times and ticks', () => {
    const { html } = build('```timeline\n2019-03 a: "A"\n2021-06-14 b: "B"\n```', { embedFonts: false });
    expect(html).toContain('>Mar 2019<');
    expect(html).toContain('>14 Jun 2021<');
    expect(html).toMatch(/class="pr-tick-label"[^>]*>2020</);
  });

  it('draws a causal loop: signed links, a delay mark and a mark for each loop', () => {
    const src = readFileSync(new URL('../docs/examples/word-of-mouth.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-causal-loop[" ]/);
    expect(count(svg, /class="pr-polarity"[^>]*>\+</g)).toBe(3);
    expect(count(svg, /class="pr-polarity"[^>]*>−</g)).toBe(2);
    expect(count(svg, /class="pr-delay"/g)).toBe(1);
    expect(svg).toMatch(/class="pr-loop" data-loop="R1" data-kind="R">.*?Word of mouth/);
    expect(svg).toMatch(/class="pr-loop" data-loop="B1" data-kind="B">.*?Saturation/);
    expect(count(svg, /class="pr-step-marker"/g)).toBe(4);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('lays a causal loop out the same way every time, without overlapping variables', () => {
    const src =
      '```causal-loop\na -> b : +\nb -> c : +\nc -> a : -\nc -> d : +\nd -> b : -\nloop "L": a -> b -> c -> a\n```';
    const first = build(src, { embedFonts: false }).html;
    expect(build(src, { embedFonts: false }).html).toBe(first);
    const boxes = [
      ...first.matchAll(
        /<rect class="pr-box pr-variable" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g,
      ),
    ].map((m) => m.slice(1).map(Number));
    expect(boxes).toHaveLength(4);
    for (const [i, [x, y, w, h]] of boxes.entries())
      for (const [x2, y2, w2, h2] of boxes.slice(i + 1))
        expect(x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h).toBe(false);
  });

  it('draws a decision tree: questions as boxes, outcomes as pills, answers on the edges', () => {
    const src = readFileSync(new URL('../docs/examples/caching.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-decision-tree[" ]/);
    expect(count(svg, /class="pr-box pr-question"/g)).toBe(3);
    expect(count(svg, /class="pr-box pr-outcome"/g)).toBe(4);
    expect(count(svg, /class="pr-edge pr-dashed"/g)).toBe(1);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('draws a tradeoffs table: a chosen column, marked cells, a category band', () => {
    const src = readFileSync(new URL('../docs/examples/sessions.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-tradeoffs[" ]/);
    expect(count(svg, /class="pr-node pr-cell/g)).toBe(15);
    expect(svg).toMatch(/class="pr-node pr-col pr-option" data-node="postgres"[^>]*data-role="focus"/);
    expect(svg).toMatch(/data-node="cookie\.revoke" data-in="cookie revoke"[^>]*data-role="error"/);
    expect(count(svg, /class="pr-good"/g)).toBe(8);
    expect(count(svg, /class="pr-group pr-band"/g)).toBe(1);
    expect(count(svg, /class="pr-step-marker"/g)).toBe(4);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('turns a tradeoffs table with direction=down and draws a missing cell as a dash', () => {
    const { html } = build('```tradeoffs direction=down\na.x : 1\na.y : 2\nb.x : 3\n```', { embedFonts: false });
    expect(html).toMatch(/class="pr-node pr-row pr-option" data-node="a"/);
    expect(html).toMatch(/class="pr-node pr-col pr-criterion" data-node="x"/);
    expect(html).toMatch(/pr-missing" data-node="b\.y"[\s\S]*?>—</);
  });

  it("draws an er diagram: entities of fields, crow's feet from the written cardinality", () => {
    const src = readFileSync(new URL('../docs/examples/orders-schema.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toMatch(/class="pr-svg pr-er[" ]/);
    expect(count(svg, /class="pr-node pr-entity"/g)).toBe(4);
    expect(count(svg, /class="pr-node pr-field/g)).toBe(14);
    expect(count(svg, /class="pr-node pr-field pr-key"/g)).toBe(4);
    expect(svg).toMatch(/data-node="orders\.coupon_id" data-in="orders"/);
    expect(svg).toContain('uuid · null');
    expect(count(svg, /class="pr-crow-ring"/g)).toBe(3);
    expect(count(svg, /class="pr-step-marker"/g)).toBe(3);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('lights the fields of a reference in the walkthrough', () => {
    const { html } = build(
      '```er\na.id : uuid {key=yes}\nb.a_id : uuid\nb.a_id -> a.id {card=N:1}\n\nsteps:\n  b.a_id -> a.id "x"\n```',
      { embedFonts: false },
    );
    expect(html).toContain('"from":"b.a_id","to":"a.id"');
  });

  it('puts an opaque plate under every edge label', () => {
    const { html } = build('```state-machine direction=right\na -> b : go now\n```', { embedFonts: false });
    expect(html).toMatch(/<g class="pr-edge-label"[^>]*><rect class="pr-elabel-plate"/);
  });
});

describe('the Press skill', () => {
  it('teaches only Press that builds cleanly', () => {
    const skill = readFileSync(new URL('../skills/press/SKILL.md', import.meta.url), 'utf8');
    const body = skill.replace(/^---[\s\S]*?---\n/, '');
    const { diagnostics, html } = build(body, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    expect(count(html, /<figure class="pr-figure"/g)).toBe(9);
  });
});

describe('print layout', () => {
  const row =
    '```architecture id=row\n' +
    Array.from({ length: 5 }, (_, i) => `c${i}: service "Component ${i}"\nc${i} -> c${i + 1}`).join('\n') +
    '\n```';

  it('gives a figure too wide for paper a second layout, and leaves a narrow one alone', () => {
    const wide = build(row, { embedFonts: false }).html;
    expect(wide).toMatch(/<svg class="pr-svg pr-architecture pr-screen-only"/);
    expect(wide).toMatch(/<svg class="pr-svg pr-architecture pr-print-only"[^>]*>.*id="press-row-paper-node-c0"/);
    const narrow = build('```state-machine\na -> b\n```', { embedFonts: false }).html;
    expect(narrow).not.toContain('pr-print-only"');
  });

  it('turns a figure on screen too when it fits better, unless the author chose a direction', () => {
    const chain = (header: string) =>
      '```architecture' +
      header +
      '\n' +
      Array.from(
        { length: 9 },
        (_, i) => `n${i}: service "A component with a long name ${i}"\nn${i} -> n${i + 1}`,
      ).join('\n') +
      '\n```';
    const width = (html: string) => Number(/<svg class="pr-svg[^"]*"[^>]*width="(\d+)"/.exec(html)?.[1]);
    expect(width(build(chain(''), { embedFonts: false }).html)).toBeLessThan(900);
    expect(width(build(chain(' direction=right'), { embedFonts: false }).html)).toBeGreaterThan(1500);
  });

  it("keeps the author's direction on paper", () => {
    expect(build(row.replace('id=row', 'id=row direction=right'), { embedFonts: false }).html).not.toContain(
      'pr-print-only"',
    );
  });

  it('drops muted elements on paper only when nothing points at them', () => {
    const chain = (prefix: string, role = '') =>
      Array.from({ length: 6 }, (_, i) => `${prefix}${i} -> ${prefix}${i + 1}${role}`).join('\n');
    const src = (extra = '') =>
      '```architecture direction=right\n' +
      chain('a') +
      '\na6 -> m0 {role=muted}\n' +
      chain('m', ' {role=muted}') +
      '\n' +
      Array.from({ length: 7 }, (_, i) => `m${i} {role=muted}`).join('\n') +
      '\n' +
      extra +
      '```';
    const paper = (html: string) => html.split('pr-print-only"')[1]?.split('</svg>')[0];
    expect(paper(build(src(), { embedFonts: false }).html)).toBeDefined();
    expect(paper(build(src(), { embedFonts: false }).html)).not.toContain('data-node="m3"');
    expect(paper(build(src('\nsteps:\n  m3 "Context matters here"\n'), { embedFonts: false }).html)).toBeUndefined();
  });
});

describe('walkthrough on a decision tree', () => {
  it('keeps only the steps on the way to the current one as visited', () => {
    const src = readFileSync(new URL('../docs/examples/caching.md', import.meta.url), 'utf8');
    const json = build(src, { embedFonts: false }).html.match(
      /<script type="application\/json" class="pr-steps">(.*?)<\/script>/,
    )?.[1];
    expect(JSON.parse(json ?? '[]').map((s: { trail: number[] }) => s.trail)).toEqual([[], [0], [0, 1], [0, 1]]);
  });
});

describe('notes', () => {
  it('prints a note under a sequence participant', () => {
    const { html } = build('```sequence\napi: service "API" {note="stateless"}\napi -> db : q\n```', {
      embedFonts: false,
    });
    expect(html).toMatch(/class="pr-note"[^>]*>.*stateless/);
  });
});

describe('v0.4 drawing', () => {
  const draw = (src: string) => build(src, { embedFonts: false }).html;

  it('draws a phase as a labelled frame, with nested phases inside', () => {
    const html = draw('```sequence\nphase outer "Outer" {\n  phase inner "Inner" {\n    a -> b\n  }\n  b -> a\n}\n```');
    expect(count(html, /<g class="pr-phase"/g)).toBe(2);
    expect(html).toMatch(/data-node="inner"[^>]*>.*Inner/);
  });

  it('marks an edge named from prose beside its label', () => {
    const html = draw('```state-machine id=m\na -> b : go\n```\n\nSee [go](#m.a->b).');
    expect(html).toMatch(/class="pr-ref-marker" data-edge="0"/);
    expect(html).toContain('data-edge="0" data-marker="a" data-near-nodes="a b"');
  });

  it('draws one track per lane on a shared axis', () => {
    const html = draw('```timeline\nlane "A" {\n  0ms x: "X"\n}\nlane "B" {\n  +2s y: "Y"\n}\nx -> y\n```');
    expect(count(html, /class="pr-lane"/g)).toBe(2);
    expect(html).toMatch(/pr-tick-label[^>]*>\+2 s</);
  });

  it('marks a tradeoffs caveat and prints its note', () => {
    const html = draw('```tradeoffs\na.x : yes {note="since 4.0"}\nb.x : no\n```');
    expect(html).toMatch(/class="pr-caveat"/);
    expect(html).toMatch(/pr-cell-note[^>]*>.*since 4\.0/);
  });
});
