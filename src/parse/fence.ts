// Parses the body of a Press fence (the shared grammar in SPEC.md) into a Diagram.
import { ROLES, type Arrow, type Attrs, type Diagnostic, type Diagram, type DiagramType, type Role, type Step } from '../model.ts';
import { TYPE_SPECS } from '../diagrams/types.ts';
import { closest, list } from './suggest.ts';
import { looksLikeTime, parseTime, TIME_EXAMPLES } from './time.ts';

const ID = /^[a-z0-9_]+(?:-[a-z0-9_]+)*/;
const LOOSE_ID = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/;
const ARROW = /^(<->|-->|->)/;
// Words authors reach for that mean one of the roles.
const ROLE_SYNONYMS: Record<string, Role> = {
  danger: 'error', fail: 'error', failure: 'error', bad: 'error', warning: 'error', invalid: 'error',
  success: 'happy', ok: 'happy', good: 'happy', main: 'happy', primary: 'happy',
  highlight: 'focus', important: 'focus', active: 'focus', current: 'focus', key: 'focus',
  dim: 'muted', secondary: 'muted', faded: 'muted', minor: 'muted', context: 'muted',
};

export interface FenceInput {
  type: DiagramType;
  info: string;
  body: string;
  // Line of the opening fence in the Markdown source.
  line: number;
}

export function parseFence(input: FenceInput, diagnostics: Diagnostic[]): Diagram {
  const diagram: Diagram = { type: input.type, nodes: [], edges: [], groups: [], steps: [], loops: [], line: input.line };
  const spec = TYPE_SPECS[input.type];
  const knownAttrs = new Set(['role', 'note', ...spec.attrs]);
  const report = (severity: Diagnostic['severity'], line: number, message: string, hint?: string): void => {
    diagnostics.push(hint ? { severity, line, message, hint } : { severity, line, message });
  };
  const error = (line: number, message: string, hint?: string) => report('error', line, message, hint);
  const warn = (line: number, message: string, hint?: string) => report('warning', line, message, hint);

  parseHeader(input, diagram, error, warn);

  const nodeIndex = new Map<string, number>();
  const declared = new Set<string>();
  const groupStack: number[] = [];
  const currentGroup = (): number => (groupStack.length ? groupStack[groupStack.length - 1] : -1);
  const ensureNode = (id: string, line: number) => {
    let i = nodeIndex.get(id);
    if (i === undefined) {
      i = diagram.nodes.length;
      nodeIndex.set(id, i);
      diagram.nodes.push({ id, label: id, attrs: {}, group: currentGroup(), line });
    }
    return diagram.nodes[i];
  };

  const rawSteps: { line: number; from: string; to?: string; label?: string; caption: string }[] = [];
  const rawLoops: { line: number; name: string; ids: string[] }[] = [];
  let inSteps = false;
  const lines = input.body.split('\n');
  for (let k = 0; k < lines.length; k++) {
    const line = input.line + 1 + k;
    const text = stripComment(lines[k]).trim();
    if (!text) continue;

    if (text === 'steps:') {
      if (inSteps) error(line, 'A fence has only one `steps:` section.', 'Delete this line; the steps above and below it belong to the same section.');
      if (groupStack.length) error(line, '`steps:` cannot be inside a group.', 'Close the group with `}` before `steps:`.');
      inSteps = true;
      continue;
    }
    if (inSteps) {
      const step = parseStepLine(text, line, error);
      if (step) rawSteps.push(step);
      continue;
    }
    if (text === '}') {
      if (!groupStack.length) error(line, 'Unexpected `}`: no group is open.', 'Delete it, or open a group with `group "Name" {`.');
      else groupStack.pop();
      continue;
    }
    const group = /^group\b\s*(.*)$/.exec(text);
    if (group) {
      const m = /^"([^"]*)"\s*\{$/.exec(group[1]);
      if (!m) {
        error(line, 'A group needs a quoted name and an opening brace.', 'Write it as `group "Name" {`, with members on the lines below and `}` on its own line.');
        continue;
      }
      diagram.groups.push({ label: m[1], parent: currentGroup(), line });
      groupStack.push(diagram.groups.length - 1);
      continue;
    }

    // A named feedback loop: loop "Name": a -> b -> a
    if (input.type === 'causal-loop' && /^loop\b/.test(text)) {
      const m = /^loop\s+"([^"]*)"\s*:\s*(.*)$/.exec(text);
      if (!m) {
        error(line, 'A loop needs a quoted name, a colon and a closed chain.', 'Write it as `loop "Word of mouth": customers -> referrals -> customers`.');
        continue;
      }
      const ids = m[2].split(/\s*(?:<->|-->|->)\s*/).map((t) => t.trim());
      if (ids.length < 3 || ids.some((t) => !ID.test(t) || ID.exec(t)![0] !== t)) {
        error(line, `Cannot read the loop chain \`${m[2]}\`.`, 'A loop is a chain of node ids that ends where it starts: `a -> b -> a`.');
        continue;
      }
      rawLoops.push({ line, name: m[1], ids });
      continue;
    }

    // A timeline line that starts with a time is an event: <when> id: "Label" {attrs}
    const when = /^(\S+)(.*)$/.exec(text)!;
    if (input.type === 'timeline' && looksLikeTime(when[1])) {
      const time = parseTime(when[1]);
      if ('error' in time) {
        error(line, time.error, `Times are written ${TIME_EXAMPLES}.`);
        continue;
      }
      const rest = when[2].trim();
      if (!rest || ARROW.test(rest)) {
        error(line, `\`${when[1]}\` is a time, so it cannot be an id in a timeline.`, `An event is a time, then an id: \`${when[1]} launch: "Label"\`. Edges join ids: \`launch -> other\`.`);
        continue;
      }
      const id = readId(rest, line, error, `after the time \`${when[1]}\``);
      if (!id) continue;
      const { body, attrs } = splitAttrs(rest.slice(id.length), line, error);
      const m = /^(?::\s*"([^"]*)")?$/.exec(body.trim());
      if (!m) {
        error(line, ARROW.test(body.trim()) ? 'An event line declares one event; it cannot hold an edge.' : `Cannot read the event \`${id}\`.`, `Write the event as \`${when[1]} ${id}: "Label"\`, and any edge on its own line: \`${id} -> other : caused\`.`);
        continue;
      }
      if (reservedSteps(id, line)) continue;
      const node = ensureNode(id, line);
      if (node.time) warn(line, `\`${id}\` is given a time twice; the later one wins.`, 'Keep one event line for it.');
      declared.add(id);
      node.group = currentGroup();
      node.line = line;
      node.time = time;
      if (m[1] !== undefined) node.label = m[1];
      applyAttrs(node, attrs, line);
      continue;
    }

    // Everything else starts with a node id.
    const first = readId(text, line, error);
    if (!first) continue;
    let rest = text.slice(first.length).trimStart();

    if (rest.startsWith(':')) {
      // Declaration: id: kind "Label" {attrs}
      rest = rest.slice(1).trim();
      const { body, attrs } = splitAttrs(rest, line, error);
      const m = /^(?:([A-Za-z][\w-]*))?\s*(?:"([^"]*)")?$/.exec(body.trim());
      if (!m || (!m[1] && m[2] === undefined)) {
        error(line, `Cannot read the declaration of \`${first}\`.`, `Write it as \`${first}: "Label"\`${spec.kinds.length ? ` or \`${first}: ${spec.kinds[0]} "Label"\`` : ''}. For an edge, use an arrow: \`${first} -> other\`.`);
        continue;
      }
      if (reserved(first, line)) continue;
      if (declared.has(first)) warn(line, `\`${first}\` is declared twice; the later declaration wins.`, 'Keep one declaration.');
      declared.add(first);
      const node = ensureNode(first, line);
      node.group = currentGroup();
      node.line = line;
      if (m[2] !== undefined) node.label = m[2];
      if (m[1]) {
        const kind = m[1];
        if (!spec.kinds.includes(kind)) {
          const near = closest(kind, spec.kinds);
          warn(
            line,
            `Unknown kind \`${kind}\` for ${input.type}; it will draw as a plain box.`,
            spec.kinds.length
              ? `${near ? `Did you mean \`${near}\`? ` : ''}Known kinds: ${list(spec.kinds)}.`
              : `${input.type} has no node kinds in this version. Write \`${first}: "${node.label}"\`.`
          );
        } else node.kind = kind;
      }
      applyAttrs(node, attrs, line);
      continue;
    }

    const arrowMatch = ARROW.exec(rest);
    if (!arrowMatch) {
      // A bare node, optionally with attributes.
      const { body, attrs } = splitAttrs(rest, line, error);
      if (body.trim()) {
        const bad = /^(=>|<-|--|—>|=>|-)/.exec(body.trim());
        if (bad) error(line, `Unknown arrow \`${body.trim().split(/\s/)[0]}\`.`, 'Edges use `->`, `-->` (dashed) or `<->` (both ways).');
        else error(line, `Unexpected text after \`${first}\`: \`${body.trim()}\`.`, `A line is an edge (\`${first} -> other : label\`), a declaration (\`${first}: "Label"\`) or a node with attributes (\`${first} {role=focus}\`).`);
        continue;
      }
      if (reservedSteps(first, line) || reservedLoop(first, line)) continue;
      const node = ensureNode(first, line);
      // Listed inside a group: the node is a member, wherever it was declared.
      if (groupStack.length) {
        if (node.group >= 0 && node.group !== currentGroup()) warn(line, `\`${first}\` is already in group "${diagram.groups[node.group].label}"; it moves to "${diagram.groups[currentGroup()].label}".`, 'A node belongs to one group. List it in only one.');
        node.group = currentGroup();
      }
      applyAttrs(node, attrs, line);
      continue;
    }

    // Edge or chain: a -> b --> c : label {attrs}
    const ids = [first];
    const arrows: Arrow[] = [];
    let ok = true;
    while (true) {
      const a = ARROW.exec(rest);
      if (!a) break;
      arrows.push(a[1] as Arrow);
      rest = rest.slice(a[1].length).trimStart();
      const id = readId(rest, line, error, `after \`${a[1]}\``);
      if (!id) {
        ok = false;
        break;
      }
      ids.push(id);
      rest = rest.slice(id.length).trimStart();
    }
    if (!ok) continue;
    const { body, attrs } = splitAttrs(rest, line, error);
    let label: string | undefined;
    const tail = body.trim();
    if (tail) {
      if (!tail.startsWith(':')) {
        const bad = /^\S+/.exec(tail)![0];
        if (/^[=<\-—]/.test(bad)) error(line, `Unknown arrow \`${bad}\`.`, 'Edges use `->`, `-->` (dashed) or `<->` (both ways).');
        else error(line, `Unexpected \`${bad}\` after \`${ids[ids.length - 1]}\`.`, 'Put a label after a colon: `a -> b : label`.');
        continue;
      }
      label = unquote(tail.slice(1).trim());
      if (!label) {
        error(line, 'Empty edge label after `:`.', 'Write a label after the colon, or delete the colon.');
        continue;
      }
      if (ids.length > 2) {
        error(line, 'A label on a chain is ambiguous: it is not clear which segment it belongs to.', `Give the labelled edge its own line, e.g. \`${ids[ids.length - 2]} -> ${ids[ids.length - 1]} : ${label}\`.`);
        continue;
      }
    }
    if (ids.some((id) => reservedSteps(id, line) || reservedLoop(id, line))) continue;
    if (input.type === 'causal-loop' && !causalEdge(arrows, label, ids, line)) continue;
    for (let i = 0; i + 1 < ids.length; i++) {
      const from = ids[i];
      const to = ids[i + 1];
      if (input.type === 'state-machine') {
        if (to === 'start') error(line, 'No transition can lead into `start`.', 'Use a regular state here; `start` is the entry pseudo-state.');
        if (from === 'end') error(line, 'No transition can leave `end`.', 'Use a regular state here; `end` is the final pseudo-state.');
      }
      ensureNode(from, line);
      ensureNode(to, line);
      const edge = { index: diagram.edges.length, from, to, arrow: arrows[i], attrs: {} as Attrs, line } as Diagram['edges'][number];
      if (label !== undefined) edge.label = label;
      applyAttrs(edge, attrs, line);
      diagram.edges.push(edge);
    }
  }
  if (groupStack.length) {
    const g = diagram.groups[groupStack[groupStack.length - 1]];
    error(g.line, `Group "${g.label}" is never closed.`, 'Add `}` on its own line after the last member.');
  }
  if (!diagram.nodes.length) warn(input.line, `The ${input.type} fence is empty.`, input.type === 'timeline' ? 'Add an event, e.g. `14:02 deploy: "v2.3 rolls out"`.' : 'Add at least one edge, e.g. `a -> b : label`.');
  if (input.type === 'timeline') checkTimeline(diagram, error, warn);
  for (const l of rawLoops) resolveLoop(l);

  for (const s of rawSteps) {
    const step = resolveStep(s);
    if (step) diagram.steps.push(step);
  }
  return diagram;

  function reservedSteps(id: string, line: number): boolean {
    if (id !== 'steps') return false;
    error(line, '`steps` is a reserved word and cannot be a node id.', 'Rename the node, e.g. `stages`. To start the walkthrough, write `steps:` alone on its line.');
    return true;
  }

  function reservedLoop(id: string, line: number): boolean {
    if (input.type !== 'causal-loop' || id !== 'loop') return false;
    error(line, '`loop` is a reserved word in a causal-loop and cannot be a node id.', 'Rename the node. To name a feedback loop, write `loop "Name": a -> b -> a`.');
    return true;
  }

  // In a causal loop every edge carries a polarity as its label, and influence runs one way.
  function causalEdge(arrows: Arrow[], label: string | undefined, ids: string[], line: number): boolean {
    const pair = `${ids[0]} -> ${ids[1]}`;
    if (arrows.includes('<->')) {
      error(line, '`<->` is not allowed in a causal loop: a mutual influence is two edges, often with different polarities.', `Write each direction on its own line: \`${ids[0]} -> ${ids[1]} : +\` and \`${ids[1]} -> ${ids[0]} : -\`.`);
      return false;
    }
    const self = ids.findIndex((id, i) => i > 0 && id === ids[i - 1]);
    if (self > 0) {
      error(line, `\`${ids[self]}\` cannot influence itself directly in a causal loop.`, 'Name what carries the effect and route the link through it: `stock -> outflow : +` and `outflow -> stock : -`.');
      return false;
    }
    if (label === undefined) {
      error(line, 'Every edge in a causal loop needs a polarity.', `Add \`: +\` if the two move the same way, \`: -\` if they move in opposite ways: \`${pair} : +\`.${ids.length > 2 ? ' A polarity is a label, so give each edge of a chain its own line.' : ''}`);
      return false;
    }
    if (label === '+' || label === '-') return true;
    const near = /^(positive|pos|same|s|plus|up|increase)$/i.test(label) ? '+' : /^(negative|neg|opposite|o|minus|down|decrease|−)$/i.test(label) ? '-' : undefined;
    error(line, `\`${label}\` is not a polarity. In a causal loop the edge label is \`+\` or \`-\`.`, near ? `Write \`${pair} : ${near}\`.` : `Use \`+\` (same direction) or \`-\` (opposite direction), and put any explanation in the prose.`);
    return false;
  }

  function resolveLoop(l: { line: number; name: string; ids: string[] }): void {
    const { ids } = l;
    if (ids[0] !== ids[ids.length - 1]) {
      error(l.line, `Loop "${l.name}" does not close: it starts at \`${ids[0]}\` and ends at \`${ids[ids.length - 1]}\`.`, `End the chain where it starts: \`${[...ids, ids[0]].join(' -> ')}\`.`);
      return;
    }
    const edges: number[] = [];
    for (let i = 0; i + 1 < ids.length; i++) {
      for (const id of [ids[i], ids[i + 1]]) {
        if (!nodeIndex.has(id)) {
          const near = closest(id, nodeIndex.keys());
          error(l.line, `Loop "${l.name}" names \`${id}\`, which is not in the diagram.`, near ? `Did you mean \`${near}\`?` : `Nodes: ${list(nodeIndex.keys())}.`);
          return;
        }
      }
      const e = diagram.edges.find((x) => x.from === ids[i] && x.to === ids[i + 1]);
      if (!e) {
        const out = diagram.edges.filter((x) => x.from === ids[i]).map((x) => `\`${x.from} -> ${x.to}\``);
        error(l.line, `Loop "${l.name}" uses \`${ids[i]} -> ${ids[i + 1]}\`, which is not an edge in the diagram.`, out.length ? `Edges from \`${ids[i]}\`: ${out.join(', ')}. Add the edge, or follow one that exists.` : `Add the edge with its polarity: \`${ids[i]} -> ${ids[i + 1]} : +\`.`);
        return;
      }
      edges.push(e.index);
    }
    const negatives = edges.filter((i) => diagram.edges[i].label === '-').length;
    const kind = negatives % 2 ? 'B' : 'R';
    const label = `${kind}${diagram.loops.filter((x) => x.kind === kind).length + 1}`;
    diagram.loops.push({ name: l.name, kind, label, nodes: ids.slice(0, -1), edges, line: l.line });
  }

  function reserved(id: string, line: number): boolean {
    if (reservedSteps(id, line) || reservedLoop(id, line)) return true;
    if (!spec.reserved.includes(id)) return false;
    error(line, `\`${id}\` is a reserved pseudo-state in ${input.type} and cannot be declared.`, `Use it in edges only (\`${id === 'end' ? 'shipped -> end' : 'start -> draft'}\`), or pick another id for a regular state.`);
    return true;
  }

  function applyAttrs(target: { attrs: Attrs; role?: Role }, attrs: Attrs, line: number): void {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'role') {
        if ((ROLES as readonly string[]).includes(value)) target.role = value as Role;
        else {
          const near = ROLE_SYNONYMS[value.toLowerCase()] ?? closest(value, ROLES);
          error(line, `Unknown role \`${value}\`.`, `${near ? `Did you mean \`role=${near}\`? ` : ''}Roles: ${list(ROLES)}.`);
        }
        continue;
      }
      if (key === 'delay' && knownAttrs.has(key) && value !== 'yes') {
        error(line, `\`delay=${value}\` is not understood.`, 'Mark a delay with `{delay=yes}`; leave the attribute out when there is none.');
        continue;
      }
      if (!knownAttrs.has(key)) {
        const near = closest(key, knownAttrs);
        const styling = /^(color|colour|fill|stroke|style|size|width|height|font|class|shape)$/.test(key);
        warn(
          line,
          `Unknown attribute \`${key}\`; it is ignored.`,
          styling
            ? 'Press attributes carry meaning, not styling. Use `role` (focus, error, happy, muted) and let the renderer choose the look.'
            : `${near ? `Did you mean \`${near}\`? ` : ''}Known attributes: ${list(knownAttrs)}.`
        );
      }
      target.attrs[key] = value;
    }
  }

  function resolveStep(s: { line: number; from: string; to?: string; label?: string; caption: string }): Step | undefined {
    if (s.to === undefined) {
      if (!nodeIndex.has(s.from)) {
        const near = closest(s.from, nodeIndex.keys());
        error(s.line, `Step refers to \`${s.from}\`, which is not in the diagram.`, near ? `Did you mean \`${near}\`?` : `Nodes: ${list(nodeIndex.keys())}.`);
        return;
      }
      return { target: { type: 'node', id: s.from }, caption: s.caption, line: s.line };
    }
    const joins = diagram.edges.filter((e) => (e.from === s.from && e.to === s.to) || (e.arrow === '<->' && e.from === s.to && e.to === s.from));
    const matches = s.label === undefined ? joins : joins.filter((e) => e.label === s.label);
    if (matches.length === 1) return { target: { type: 'edge', index: matches[0].index }, caption: s.caption, line: s.line };
    if (!joins.length) {
      const fromHere = diagram.edges.filter((e) => e.from === s.from).map((e) => `\`${e.from} -> ${e.to}\``);
      for (const id of [s.from, s.to]) {
        if (!nodeIndex.has(id)) {
          const near = closest(id, nodeIndex.keys());
          error(s.line, `Step refers to \`${id}\`, which is not in the diagram.`, near ? `Did you mean \`${near}\`?` : `Nodes: ${list(nodeIndex.keys())}.`);
          return;
        }
      }
      error(s.line, `Step refers to an edge \`${s.from} -> ${s.to}\` that the diagram does not have.`, fromHere.length ? `Edges from \`${s.from}\`: ${fromHere.join(', ')}.` : `Add the edge above \`steps:\`, or step through a node with \`${s.from} "caption"\`.`);
      return;
    }
    const options = joins.map((e) => (e.label ? `\`${e.from} -> ${e.to} : ${e.label} "…"\`` : `(unlabelled, line ${e.line})`));
    if (!matches.length) error(s.line, `No edge \`${s.from} -> ${s.to}\` has the label "${s.label}".`, `Labels on this edge: ${options.join(', ')}.`);
    else error(s.line, `Step \`${s.from} -> ${s.to}\` is ambiguous: ${matches.length} edges join these nodes.`, `Name the edge by its label: ${options.join(', ')}.`);
    return;
  }
}

// The rules a timeline adds once every line is read: dated or undated, one kind of time,
// events in order, and spans that end after they start.
function checkTimeline(d: Diagram, error: (l: number, m: string, h?: string) => void, warn: (l: number, m: string, h?: string) => void): void {
  const events = [...d.nodes].sort((a, b) => a.line - b.line);
  for (const node of events) {
    if (/^\d{4}(?:-\d{2}){0,2}$/.test(node.id) && !node.time) error(node.line, `\`${node.id}\` looks like a date, so it cannot be an id in a timeline.`, `To make it an event, give it an id after the time: \`${node.id} launch: "Label"\`.`);
  }
  const dated = events.filter((e) => e.time);
  if (!dated.length) {
    for (const e of events) if (e.attrs.until !== undefined) error(e.line, '`until` needs a dated timeline.', `Give every event a time, e.g. \`2019 ${e.id}: "${e.label}" {until=2021}\`, or remove \`until\`.`);
    return;
  }
  for (const e of events) {
    if (!e.time) error(e.line, `\`${e.id}\` has no time, but other events in this timeline do.`, `Give it one, e.g. \`${dated[0].time!.text} ${e.id}: "${e.label}"\`. A timeline is either dated or undated throughout.`);
  }
  const clock = dated.find((e) => e.time!.form === 'clock');
  const calendar = dated.find((e) => e.time!.form !== 'clock');
  if (clock && calendar) {
    const late = clock.line > calendar.line ? clock : calendar;
    error(late.line, `\`${late.time!.text}\` is a ${late === clock ? 'clock time' : 'date'}, but \`${(late === clock ? calendar : clock).time!.text}\` above is a ${late === clock ? 'date' : 'clock time'}.`, 'Use one kind throughout: clock times like `14:02`, or dates like `2019-03-14` and `2019-03-14T14:02`.');
    return;
  }
  let prev: (typeof dated)[number] | undefined;
  for (const e of dated) {
    if (prev && e.time!.value < prev.time!.value) warn(e.line, `\`${e.id}\` (${e.time!.text}) is earlier than \`${prev.id}\` (${prev.time!.text}) above it.`, 'Events are listed in order. Move the line up, or check the time for a typo.');
    prev = e;
    const until = e.attrs.until;
    if (until === undefined) continue;
    const t = parseTime(until);
    if ('error' in t) error(e.line, `\`until\`: ${t.error}`, `Write it in the same form as the event's time, \`${e.time!.text}\`.`);
    else if (t.form !== e.time!.form) error(e.line, `\`until=${until}\` is not in the same form as the event's time, \`${e.time!.text}\`.`, `Write both the same way, e.g. \`${e.time!.text} ${e.id}: "${e.label}" {until=${e.time!.text}}\` with the end time.`);
    else if (t.value < e.time!.value) error(e.line, `\`${e.id}\` ends (${until}) before it starts (${e.time!.text}).`, 'Check the two times; `until` is when the span ends.');
    else e.until = t;
  }
}

function parseHeader(input: FenceInput, diagram: Diagram, error: (l: number, m: string, h?: string) => void, warn: (l: number, m: string, h?: string) => void): void {
  const line = input.line;
  let rest = input.info.slice(input.type.length).trim();
  while (rest) {
    const m = /^([A-Za-z_-]+)=("([^"]*)"|\S+)\s*/.exec(rest);
    if (!m) {
      const word = rest.split(/\s+/)[0];
      error(line, `Cannot read \`${word}\` in the fence header.`, 'Header fields are `key=value`; quote values with spaces: `title="Order lifecycle"`.');
      return;
    }
    rest = rest.slice(m[0].length);
    const key = m[1];
    const value = m[3] ?? m[2];
    if (key === 'id') {
      if (!ID.test(value) || ID.exec(value)![0] !== value) error(line, `Diagram id \`${value}\` is not valid.`, `Ids use lowercase letters, digits, \`_\` and \`-\`: \`id=${value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}\`.`);
      else diagram.id = value;
    } else if (key === 'title') diagram.title = value;
    else if (key === 'direction') {
      if (value !== 'right' && value !== 'down') error(line, `Unknown direction \`${value}\`.`, 'Use `direction=right` or `direction=down`.');
      else if (!TYPE_SPECS[input.type].directional) warn(line, `\`direction\` has no meaning in a ${input.type}; it is ignored.`, 'Delete `direction=…` from the header.');
      else diagram.direction = value;
    } else {
      const near = closest(key, ['id', 'title', 'direction']);
      warn(line, `Unknown header field \`${key}\`; it is ignored.`, `${near ? `Did you mean \`${near}\`? ` : ''}Header fields: \`id\`, \`title\`, \`direction\`.`);
    }
  }
}

// Reads a node id at the start of text, reporting a fix when it is close to valid.
function readId(text: string, line: number, error: (l: number, m: string, h?: string) => void, where = 'at the start of the line'): string | undefined {
  const m = ID.exec(text);
  const loose = LOOSE_ID.exec(text);
  if (loose && (!m || loose[0].length > m[0].length)) {
    const fixed = loose[0].toLowerCase();
    error(line, `Node id \`${loose[0]}\` has uppercase letters.`, `Ids are lowercase: use \`${fixed}\`, and declare a label for display: \`${fixed}: "${loose[0]}"\`.`);
    return undefined;
  }
  if (m) return m[0];
  const word = text.split(/\s+/)[0] || '(nothing)';
  if (text.startsWith('"')) error(line, `Expected a node id ${where}, found a quoted label.`, 'Use an id here and declare its label separately: `paid: "Paid in full"`.');
  else error(line, `Expected a node id ${where}, found \`${word}\`.`, 'Ids use lowercase letters, digits, `_` and `-`, e.g. `payment_ok`.');
  return undefined;
}

// Splits a trailing `{key=value, ...}` block off the end of text.
function splitAttrs(text: string, line: number, error: (l: number, m: string, h?: string) => void): { body: string; attrs: Attrs } {
  const attrs: Attrs = {};
  const t = text.trimEnd();
  if (!t.endsWith('}')) {
    if (outsideQuotes(t, '{') >= 0) error(line, 'Attributes are missing their closing `}`.', 'Close them at the end of the line: `{role=error}`.');
    return { body: text, attrs };
  }
  const open = lastOutsideQuotes(t, '{');
  if (open < 0) {
    error(line, 'Unexpected `}`.', 'Attributes go in braces at the end of a line: `{role=error}`.');
    return { body: text, attrs };
  }
  const inner = t.slice(open + 1, -1);
  for (const part of splitOutsideQuotes(inner, ',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^([A-Za-z_-]+)\s*=\s*("([^"]*)"|[^\s"]+)$/.exec(p);
    if (!m) {
      if (/^[A-Za-z_-]+$/.test(p)) error(line, `Attribute \`${p}\` has no value.`, `Write \`${p}=value\`${p === 'focus' || p === 'error' || p === 'happy' || p === 'muted' ? `, here \`role=${p}\`` : ''}.`);
      else if (/^[A-Za-z_-]+\s*:/.test(p)) error(line, `Attributes use \`=\`, not \`:\`: \`${p}\`.`, `Write \`${p.replace(/\s*:\s*/, '=')}\`.`);
      else error(line, `Cannot read attribute \`${p}\`.`, 'Attributes are `key=value`, separated by commas; quote values with spaces: `{note="retried up to 3 times"}`.');
      continue;
    }
    attrs[m[1]] = m[3] ?? m[2];
  }
  return { body: t.slice(0, open), attrs };
}

function parseStepLine(text: string, line: number, error: (l: number, m: string, h?: string) => void): { line: number; from: string; to?: string; label?: string; caption: string } | undefined {
  const m = /"([^"]*)"\s*$/.exec(text);
  if (!m || m.index === 0) {
    error(line, 'A step needs a target and a quoted caption.', 'Write `draft -> submitted "The user submits the cart"`, or `draft "Every order starts here"` for a node.');
    return;
  }
  const caption = m[1];
  let target = text.slice(0, m.index).trim();
  const from = readId(target, line, error);
  if (!from) return;
  target = target.slice(from.length).trim();
  if (!target) return { line, from, caption };
  const a = ARROW.exec(target);
  if (!a) {
    error(line, `Cannot read the step target \`${text.slice(0, m.index).trim()}\`.`, 'A step names one node (`draft`) or one edge (`draft -> submitted`).');
    return;
  }
  target = target.slice(a[1].length).trim();
  const to = readId(target, line, error, `after \`${a[1]}\``);
  if (!to) return;
  target = target.slice(to.length).trim();
  if (!target) return { line, from, to, caption };
  if (ARROW.test(target)) {
    error(line, 'A step names a single edge, not a chain.', 'Split it into one step per edge.');
    return;
  }
  if (!target.startsWith(':')) {
    error(line, `Unexpected \`${target}\` in step.`, 'To pick one of several edges, add its label: `api -> db : insert "caption"`.');
    return;
  }
  return { line, from, to, label: unquote(target.slice(1).trim()), caption };
}

// Comments: a line starting with `#`, or ` # ` after content.
function stripComment(line: string): string {
  if (/^\s*#/.test(line)) return '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === '#' && /\s/.test(line[i - 1] ?? '') && /\s|$/.test(line[i + 1] ?? '')) return line.slice(0, i);
  }
  return line;
}

function unquote(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

function outsideQuotes(s: string, ch: string): number {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (!quoted && s[i] === ch) return i;
  }
  return -1;
}

function lastOutsideQuotes(s: string, ch: string): number {
  let quoted = false;
  let at = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (!quoted && s[i] === ch) at = i;
  }
  return at;
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (!quoted && s[i] === sep) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}
