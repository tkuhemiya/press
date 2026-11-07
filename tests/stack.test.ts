import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Diagram, type DiagramType, type Document } from '../src/index.ts';
import { renderTerminal } from '../src/render/terminal.ts';

const fence = (type: string, body: string) => `# Doc\n\n\`\`\`${type}\n${body}\n\`\`\`\n`;
const parse = (type: string, body: string) => parseDocument(fence(type, body));
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = <T extends DiagramType>(doc: Document, type: T): Diagram<T> => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, type)) throw new Error(`expected a ${type}`);
  return d;
};
const messages = (doc: Document) => doc.diagnostics.map((d) => `${d.severity} ${d.line}: ${d.message}`);

const FACTORIAL = `f3: "factorial(3)"
f2: "factorial(2)"
main -> f3
f3 -> f2
f2 --> f3 : 2
f3 --> main : 6`;

describe('call-stack', () => {
  it('builds frames with their depth and lifetime from calls and returns', () => {
    const doc = parse('call-stack', FACTORIAL);
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'call-stack');
    expect(d.span).toBe(5);
    expect(d.nodes.map((f) => [f.id, f.depth, f.start, f.end, f.open])).toEqual([
      ['main', 0, 0, 5, true],
      ['f3', 1, 1, 4, false],
      ['f2', 2, 2, 3, false],
    ]);
  });

  it('lets only the frame on top call or return, and names it', () => {
    const doc = parse('call-stack', 'main -> a\nmain -> b\na --> main\nmain -> a');
    expect(messages(doc)).toEqual([
      'error 5: `main` cannot call here: `a` is on top of the stack.',
      'error 7: `a` was already called on line 4; a frame is called once.',
    ]);
    expect(doc.diagnostics[0]?.hint).toContain('`a --> main`');
    expect(doc.diagnostics[1]?.hint).toContain('`a_2: "a"`');
  });

  it('unwinds the frames between a throw and its handler and cuts them off', () => {
    const doc = parse('call-stack', 'handle -> save\nsave -> charge\ncharge --> handle : Timeout {role=error}');
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'call-stack');
    expect(d.nodes.map((f) => [f.id, f.end, f.cut])).toEqual([
      ['handle', 4, false],
      ['save', 3, true],
      ['charge', 3, false],
    ]);
  });

  it('rejects a return to a frame that is not below, groups and changes', () => {
    const doc = parse('call-stack', 'main -> a\na --> b\n+ a -> c\ngroup "x" {\n  main\n}');
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        'error 6: A call-stack cannot show a change: `+` and `-` lines are not allowed here.',
        'error 7: A call stack has no groups: frames nest by calling each other.',
        'error 5: `a` cannot return to `b`: it is not below `a` on the stack.',
      ]),
    );
  });

  it('draws frames as nodes and events as steppable edges', () => {
    const { html, diagnostics } = build(fence('call-stack', `${FACTORIAL}\nsteps:\n  f3 -> f2 "deeper"`), {
      embedFonts: false,
    });
    expect(diagnostics).toEqual([]);
    expect(html).toContain('data-node="f2"');
    expect((html.match(/class="pr-edge[ "][^>]*data-edge=/g) ?? []).length).toBe(4);
    expect(html).toContain('→ 6');
  });

  it('draws the stack in the terminal, and a trace when it is too wide', () => {
    const wide = renderTerminal(parseDocument(fence('call-stack', FACTORIAL)), { width: 80, theme: 'plain' });
    expect(wide).toContain('│ factorial(2)');
    const narrow = renderTerminal(parseDocument(fence('call-stack', FACTORIAL)), { width: 30, theme: 'plain' });
    expect(narrow).toContain('↩ factorial(3) returns 6');
  });
});

const ORDER = `order.paid : bool
order.pad : padding {size=7}
order.id : u64
order.total : u32`;

describe('memory-layout', () => {
  it('places fields one after another and sizes them from their type', () => {
    const doc = parse('memory-layout', `${ORDER}\norder.name : "u8[24]"\norder.blob : Blob {size=5}`);
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'memory-layout');
    expect(d.nodes[0]?.slots.map((s) => [s.name, s.offset, s.size, s.padding])).toEqual([
      ['paid', 0, 1, false],
      ['pad', 1, 7, true],
      ['id', 8, 8, false],
      ['total', 16, 4, false],
      ['name', 20, 24, false],
      ['blob', 44, 5, false],
    ]);
    expect(d.nodes[0]?.size).toBe(49);
  });

  it('warns about a misaligned field and says how much padding fixes it', () => {
    const doc = parse('memory-layout', 'order.paid : bool\norder.id : u64');
    expect(messages(doc)).toEqual(['warning 5: `order.id` (u64) starts at byte 1, which is not a multiple of 8.']);
    expect(doc.diagnostics[0]?.hint).toContain('`order.pad : padding {size=7}`');
    expect(parse('memory-layout', 'order {packed=yes}\norder.paid : bool\norder.id : u64').diagnostics).toEqual([]);
  });

  it('asks for a size when the type has none, and for a type when there is none', () => {
    const doc = parse('memory-layout', 'a.x : Widget\na.pad : padding\na.y');
    expect(messages(doc)).toEqual([
      'error 4: `Widget` has no size Press knows.',
      'error 5: `a.pad` is padding with no size.',
      'error 6: `a.y` needs a type.',
    ]);
  });

  it('draws pointers from fields, and warns when the field is not a pointer', () => {
    const doc = parse('memory-layout', 'a.next : ptr\na.id : u64\nb.v : u8\na.next -> b\na.id -> b\na -> b');
    expect(messages(doc)).toEqual([
      'warning 8: `a.id` is a u64, not a pointer.',
      'error 9: A pointer starts at a field, not a whole block: `a -> b`.',
    ]);
    expect(first(doc, 'memory-layout').edges.map((e) => [e.from.field, e.to.entity])).toEqual([
      ['next', 'b'],
      ['id', 'b'],
    ]);
  });

  it('draws fields as steppable nodes on screen and a byte grid in the terminal', () => {
    const { html, diagnostics } = build(fence('memory-layout', `${ORDER}\nsteps:\n  order.pad "wasted"`), {
      embedFonts: false,
    });
    expect(diagnostics).toEqual([]);
    expect(html).toContain('data-node="order.pad"');
    const term = renderTerminal(parseDocument(fence('memory-layout', ORDER)), { width: 80, theme: 'plain' });
    expect(term).toContain('│id  u64');
    expect(term).toContain('│paid│pad');
  });
});
