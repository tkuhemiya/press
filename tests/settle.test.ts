import { describe, expect, it } from 'vitest';
import { parseReports, settle, unfitSections, type Report } from '../src/render/settle.ts';

const figure = (key: string, room: number, heights: number[], full = 500): Report => ({
  key,
  room,
  heights,
  full,
  title: '',
});

const section = (key: string, room: number, heights: number[], title = 'Section'): Report => ({
  key,
  room,
  heights,
  full: 500,
  title,
});

describe('settle', () => {
  it('shrinks a figure to the largest candidate that fits the room', () => {
    const reports = [figure('pm-a', 120, [150, 90, 60])];
    expect(settle(reports, {})).toEqual({ 'pm-a': 1 });
  });

  it('keeps the first candidate when it fits with the 16pt slack', () => {
    const reports = [figure('pm-a', 166, [150, 90])];
    expect(settle(reports, {})).toBe('settled');
  });

  it('takes the first candidate that fits a full page when none fits the room', () => {
    const reports = [figure('pm-a', 100, [600, 400, 300])];
    expect(settle(reports, {})).toEqual({ 'pm-a': 1 });
  });

  it('takes the smallest candidate when nothing fits a full page', () => {
    const reports = [figure('pm-a', 100, [700, 600, 650])];
    expect(settle(reports, {})).toEqual({ 'pm-a': 1 });
  });

  it('drops the choices after a changed decision, since their rooms move', () => {
    const reports = [figure('pm-a', 200, [300, 100]), figure('pm-b', 50, [40, 20])];
    expect(settle(reports, { 'pm-a': 0, 'pm-b': 1 })).toEqual({ 'pm-a': 1 });
  });

  it('keeps earlier choices when a later one changes', () => {
    const reports = [figure('pm-a', 200, [300, 100]), figure('pm-b', 50, [40, 20])];
    expect(settle(reports, { 'pm-a': 1, 'pm-b': 0 })).toEqual({ 'pm-a': 1, 'pm-b': 1 });
  });

  it('returns settled when every choice matches its report', () => {
    const reports = [figure('pm-a', 200, [300, 100]), figure('pm-b', 50, [40, 20])];
    expect(settle(reports, { 'pm-a': 1, 'pm-b': 1 })).toBe('settled');
  });

  it('treats a missing choice as the first candidate', () => {
    expect(settle([figure('pm-a', 200, [150])], {})).toBe('settled');
  });

  it('places a section at its level in place when it fits the room', () => {
    const heights = [300, 200, 150, 120, 100, 90, 80, 70];
    expect(settle([section('pm-sec-0', 100, heights)], {})).toEqual({ 'pm-sec-0': 6 });
  });

  it('breaks before a section that fits a full page but not the room', () => {
    const heights = [300, 200, 150, 120, 100, 90, 80, 70];
    expect(settle([section('pm-sec-0', 50, heights)], {})).toEqual({ 'pm-sec-0': 8 });
  });

  it('leaves a section that fits no page at its first level, to flow', () => {
    const heights = [700, 650, 600, 600, 600, 600, 600, 600];
    expect(settle([section('pm-sec-0', 50, heights)], { 'pm-sec-0': 3 })).toEqual({ 'pm-sec-0': 0 });
  });

  it('names sections whose levels all overflow a page', () => {
    const reports = [
      section('pm-sec-0', 50, [700, 600, 600, 600, 600, 600, 600, 600], 'Too long'),
      section('pm-sec-1', 50, [300, 200, 150, 120, 100, 90, 80, 70], 'Fine'),
    ];
    expect(unfitSections(reports)).toEqual(['Too long']);
  });
});

describe('parseReports', () => {
  it('reads the reports Typst prints', () => {
    const text = '[{"key":"pm-a","room":12.5,"heights":[1,2],"full":500,"title":""}]';
    expect(parseReports(text)).toEqual([{ key: 'pm-a', room: 12.5, heights: [1, 2], full: 500, title: '' }]);
  });

  it('rejects output that is not a list of reports', () => {
    expect(() => parseReports('{"key":"pm-a"}')).toThrow();
    expect(() => parseReports('[{"key":"pm-a","room":"x","heights":[],"full":1,"title":""}]')).toThrow();
  });
});
