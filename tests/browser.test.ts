// Checks the rendered page in Chromium: the walkthrough, prose references and the print
// rules in SPEC.md. Skipped when Playwright is not installed.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../src/index.ts';

function loadPlaywright(): any {
  for (const base of [import.meta.url, '/opt/node-tools/node_modules/']) {
    try {
      return createRequire(base)('playwright');
    } catch {}
  }
  return undefined;
}
const playwright = loadPlaywright();

// A4 with the print stylesheet's margins, in CSS pixels.
const PAGE_W = ((210 - 34) / 25.4) * 96;
const PAGE_H = ((297 - 38) / 25.4) * 96;

describe.skipIf(!playwright)('in the browser', () => {
  const html = build(readFileSync(new URL('../examples/checkout.md', import.meta.url), 'utf8')).html;
  const file = join(mkdtempSync(join(tmpdir(), 'press-')), 'checkout.html');
  writeFileSync(file, html);
  let browser: any;
  let page: any;

  beforeAll(async () => {
    browser = await playwright.chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  const open = async (hash = '') => {
    page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(file).href + hash);
    return page;
  };
  const stroke = (sel: string) => page.$eval(sel, (el: Element) => getComputedStyle(el).stroke);

  it('walks through the steps with buttons and keys', async () => {
    await open();
    const fig = '#press-order';
    expect(await page.$eval(`${fig} .pr-count`, (el: Element) => el.textContent)).toBe('');
    await page.click(`${fig} [data-act="next"]`);
    expect(await page.$eval(`${fig} .pr-count`, (el: Element) => el.textContent)).toBe('1 / 6');
    expect(await page.$$eval(`${fig} .pr-node.is-current`, (els: Element[]) => els.map((e) => (e as HTMLElement).dataset.node))).toEqual(['draft']);
    await page.keyboard.press('ArrowRight');
    expect(await page.$eval(`${fig} .pr-edge.is-current`, (el: HTMLElement) => [el.dataset.from, el.dataset.to])).toEqual(['draft', 'submitted']);
    expect(await page.$eval(`${fig} .pr-caption`, (el: Element) => el.textContent)).toContain('Pay submits the order');
    await page.keyboard.press('Escape');
    expect(await page.$eval(fig, (el: Element) => el.classList.contains('pr-walking'))).toBe(false);
  });

  it('opens a step from a deep link', async () => {
    await open('#order/3');
    expect(await page.$eval('#press-order .pr-count', (el: Element) => el.textContent)).toBe('3 / 6');
    expect(await page.$eval('#press-order .pr-edge.is-current', (el: HTMLElement) => el.dataset.to)).toBe('failed');
  });

  it('points at a node when a prose reference is hovered', async () => {
    await open();
    await page.hover('a.pr-ref[data-node="cancelled"]');
    expect(await page.$$eval('#press-order .is-pointed', (els: Element[]) => els.map((e) => (e as HTMLElement).dataset.node))).toEqual(['cancelled']);
  });

  describe('print', () => {
    beforeAll(async () => {
      // Leave a walkthrough mid-way: it must not show on paper.
      await open('#order/2');
      await page.setViewportSize({ width: Math.floor(PAGE_W), height: Math.floor(PAGE_H) });
      await page.emulateMedia({ media: 'print' });
    });

    it('keeps each diagram to one frame that fits on a page', async () => {
      const figures = await page.$$eval('.pr-figure', (els: Element[]) =>
        els.map((el) => ({ svgs: el.querySelectorAll('svg.pr-svg').length, height: el.getBoundingClientRect().height, breakInside: getComputedStyle(el).breakInside }))
      );
      expect(figures).toHaveLength(2);
      for (const f of figures) {
        expect(f.svgs).toBe(1);
        expect(f.breakInside).toBe('avoid');
        expect(f.height).toBeLessThan(PAGE_H);
      }
    });

    it('shows step markers and the legend, hides the controls', async () => {
      expect(await page.$eval('.pr-walk', (el: Element) => getComputedStyle(el).display)).toBe('none');
      expect(await page.$eval('.pr-legend', (el: Element) => getComputedStyle(el).display)).toBe('block');
      expect(await page.$$eval('#press-order .pr-step-marker', (els: Element[]) => els.filter((e) => getComputedStyle(e).display !== 'none').length)).toBe(6);
      expect(await page.$eval('a.pr-ref', (el: Element) => getComputedStyle(el, '::after').content)).toBe('"a"');
    });

    it('drops the walkthrough highlight', async () => {
      expect(await page.$eval('#press-order', (el: Element) => el.classList.contains('pr-walking'))).toBe(true);
      const current = '#press-order .pr-edge[data-from="draft"][data-to="submitted"] .pr-line';
      const plain = '#press-order .pr-edge[data-from="start"] .pr-line';
      expect(await stroke(current)).toBe(await stroke(plain));
      expect(await page.$eval('#press-order .pr-node[data-node="paid"]', (el: Element) => getComputedStyle(el).opacity)).toBe('1');
    });

    it('prints to PDF with no figure split across pages', async () => {
      const pdf: Buffer = await page.pdf({ format: 'A4', printBackground: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages).toBeLessThanOrEqual(2);
    });
  });
});

// Every example, whatever its diagram types: the walkthrough steps, and each figure prints as
// one frame that fits on a page.
const EXAMPLES = new URL('../examples/', import.meta.url);
const examples = readdirSync(EXAMPLES).filter((f) => f.endsWith('.md'));

describe.skipIf(!playwright)('every example in the browser', () => {
  let browser: any;
  beforeAll(async () => {
    browser = await playwright.chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(examples)('%s walks through and prints', async (name) => {
    const html = build(readFileSync(new URL(name, EXAMPLES), 'utf8')).html;
    const file = join(mkdtempSync(join(tmpdir(), 'press-')), name.replace(/\.md$/, '.html'));
    writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(file).href);

    for (const fig of await page.$$('.pr-figure[data-steps]')) {
      const total = JSON.parse(await fig.$eval('.pr-steps', (el: Element) => el.textContent)).length;
      await (await fig.$('[data-act="next"]')).click();
      expect(await fig.$eval('.pr-count', (el: Element) => el.textContent)).toBe(`1 / ${total}`);
      expect(await fig.$$('.is-current')).not.toHaveLength(0);
    }

    await page.setViewportSize({ width: Math.floor(PAGE_W), height: Math.floor(PAGE_H) });
    await page.emulateMedia({ media: 'print' });
    const figures = await page.$$eval('.pr-figure', (els: Element[]) =>
      els.map((el) => ({
        height: el.getBoundingClientRect().height,
        // Only the drawing that prints: a figure may carry a second layout for paper.
        markers: [...el.querySelectorAll('.pr-step-marker')].filter((m) => m.closest('svg')!.checkVisibility()).length,
        steps: el.querySelectorAll('.pr-legend li').length,
      }))
    );
    expect(figures.length).toBeGreaterThan(0);
    for (const f of figures) {
      expect(f.height).toBeLessThan(PAGE_H);
      expect(f.markers).toBe(f.steps);
    }
    await page.close();
  });
});
