import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build } from '../src/index.ts';
import { textWidth } from '../src/text/measure.ts';

const checkout = readFileSync(new URL('../examples/checkout.md', import.meta.url), 'utf8');
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
    expect(html).toContain('<li><b>2</b><span>Pressing <strong>Pay</strong> submits the order and freezes the cart.</span></li>');
  });

  it('marks prose references with letters on the node and in the text', () => {
    expect(html).toContain('<a class="pr-ref" href="#press-order-node-failed" data-figure="press-order" data-node="failed" data-marker="a">');
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
    const { html } = build(`\`\`\`sequence\na -> b : ${long}\nb -> b : think hard about it\n\`\`\``, { embedFonts: false });
    const xs = [...html.matchAll(/<line class="pr-lifeline" x1="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs[1] - xs[0]).toBeGreaterThan(textWidth(long, 12.5) + 30);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('keeps grouped participants together', () => {
    const { html } = build('```sequence\na -> x\ngroup "Back end" {\n  b\n  c\n}\nx -> c\nx -> b\n```', { embedFonts: false });
    const order = [...html.matchAll(/class="pr-node pr-participant" data-node="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['a', 'x', 'b', 'c']);
  });
});
