import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from '../src/index.ts';

describe('in the browser', () => {
  const html = build(readFileSync(new URL('../docs/examples/checkout.md', import.meta.url), 'utf8')).html;
  const file = join(mkdtempSync(join(tmpdir(), 'press-')), 'checkout.html');
  writeFileSync(file, html);
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  const open = async (hash = '') => {
    page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(file).href + hash);
    return page;
  };

  it('walks through the steps with buttons and keys', async () => {
    await open();
    const fig = '#press-order';
    expect(await page.$eval(`${fig} .pr-count`, (el: Element) => el.textContent)).toBe('');
    await page.click(`${fig} [data-act="next"]`);
    expect(await page.$eval(`${fig} .pr-count`, (el: Element) => el.textContent)).toBe('1 / 6');
    expect(
      await page.$$eval(`${fig} .pr-node.is-current`, (els: Element[]) => els.map((e) => e.getAttribute('data-node'))),
    ).toEqual(['draft']);
    await page.keyboard.press('ArrowRight');
    expect(
      await page.$eval(`${fig} .pr-edge.is-current`, (el: HTMLElement) => [el.dataset.from, el.dataset.to]),
    ).toEqual(['draft', 'submitted']);
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
    expect(
      await page.$$eval('#press-order .is-pointed', (els: Element[]) => els.map((e) => e.getAttribute('data-node'))),
    ).toEqual(['cancelled']);
  });
});

describe('phases and edge references in the browser', () => {
  const html = build(readFileSync(new URL('../docs/examples/oauth.md', import.meta.url), 'utf8')).html;
  const file = join(mkdtempSync(join(tmpdir(), 'press-')), 'oauth.html');
  writeFileSync(file, html);
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(file).href);
  });
  afterAll(async () => {
    await browser?.close();
  });
  const pointed = (sel: string) =>
    page.$$eval(sel, (els: Element[]) => els.map((e) => e.getAttribute('data-node') ?? e.getAttribute('data-edge')));

  it('points at a phase and brings its messages forward', async () => {
    await page.hover('a.pr-ref[data-node="back"]');
    expect(await pointed('#press-oauth .is-pointed')).toEqual(['back']);
    expect(await pointed('#press-oauth .pr-edge.is-near')).toEqual(['6', '7', '8', '9']);
    expect(await pointed('#press-oauth .pr-node.is-near')).toEqual(['app', 'auth', 'api']);
  });

  it('points at one edge', async () => {
    await page.hover('a.pr-ref[data-edge="6"]');
    expect(await pointed('#press-oauth .pr-edge.is-pointed')).toEqual(['6']);
    expect(await pointed('#press-oauth .pr-node.is-near')).toEqual(['app', 'auth']);
  });
});

const EXAMPLES = new URL('../docs/examples/', import.meta.url);
const examples = readdirSync(EXAMPLES).filter((f) => f.endsWith('.md'));

describe('every example in the browser', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(examples)('%s walks through', async (name) => {
    const html = build(readFileSync(new URL(name, EXAMPLES), 'utf8')).html;
    const file = join(mkdtempSync(join(tmpdir(), 'press-')), name.replace(/\.md$/, '.html'));
    writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(file).href);

    for (const fig of await page.$$('.pr-figure[data-steps]')) {
      const total = JSON.parse(await fig.$eval('.pr-steps', (el: Element) => el.textContent)).length;
      await (await fig.waitForSelector('[data-act="next"]')).click();
      expect(await fig.$eval('.pr-count', (el: Element) => el.textContent)).toBe(`1 / ${total}`);
      expect(await fig.$$('.is-current')).not.toHaveLength(0);
    }

    await page.close();
  });
});
