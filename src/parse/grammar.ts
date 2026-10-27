import { ROLES } from '../model.ts';
import type { Arrow, DiagramId, Direction, GroupId, Html, NodeId, NonEmpty, PhaseIndex, Role, Time } from '../model.ts';
import { diagramId, groupId, nodeId, phaseIndex } from '../brand.ts';
import { closest, list, type Reporter } from '../diagnostics.ts';
import { looksLikeTime, parseTime, TIME_EXAMPLES } from './time.ts';

export type Attrs = ReadonlyMap<string, string>;

export type LineForm = 'event' | 'loop' | 'prop' | 'field' | 'phase';

export interface Grammar {
  reserved: readonly string[];
  kinds: readonly string[];
  attrs: readonly string[];
  forms: readonly LineForm[];
  directional: boolean;
}

export type End = { node: NodeId; key?: NodeId };

interface Meaning {
  role?: Role;
  note?: string;
  attrs: Attrs;
  group?: GroupId;
  phase?: PhaseIndex;
  line: number;
}

type Declare = Meaning & { type: 'declare'; id: NodeId; kind?: string; label?: string };
type Mention = Meaning & { type: 'mention'; id: NodeId };
export type Chain = Meaning & { type: 'chain'; ends: [End, End, ...End[]]; arrows: NonEmpty<Arrow>; label?: string };
export type Prop = Meaning & { type: 'prop'; node: NodeId; key: NodeId; value?: string };
type Event = Meaning & { type: 'event'; at: Time; id: NodeId; label?: string };
type LoopLine = { type: 'loop'; id?: NodeId; name: string; ends: [NodeId, NodeId, ...NodeId[]]; line: number };

type Statement = Declare | Mention | Chain | Prop | Event | LoopLine;

export interface RawStep {
  from: End;
  to?: End;
  label?: string;
  caption: Html;
  line: number;
}

interface FenceGroup {
  label: string;
  parent?: GroupId;
  line: number;
}

interface FencePhase {
  id?: NodeId;
  label: string;
  parent?: PhaseIndex;
  line: number;
}

export interface Fence {
  type: string;
  id?: DiagramId;
  title?: string;
  direction?: Direction;
  line: number;
  groups: FenceGroup[];
  phases: FencePhase[];
  statements: Statement[];
  steps: RawStep[];
}

export interface FenceInput {
  type: string;
  info: string;
  body: string;
  line: number;
  grammar: Grammar;
  inline: (markdown: string) => Html;
  formsElsewhere: (form: LineForm) => readonly string[];
}

const ID = /^[a-z0-9_]+(?:-[a-z0-9_]+)*/;
const LOOSE_ID = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/;
const ARROW = /^(<->|-->|->)/;
const PROP = /^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.([a-z0-9_]+(?:-[a-z0-9_]+)*)/;
const KEY = /^\.([a-z0-9_]+(?:-[a-z0-9_]+)*)/;

const ROLE_SYNONYMS: Record<string, Role> = {
  danger: 'error',
  fail: 'error',
  failure: 'error',
  bad: 'error',
  warning: 'error',
  invalid: 'error',
  success: 'happy',
  ok: 'happy',
  good: 'happy',
  main: 'happy',
  primary: 'happy',
  highlight: 'focus',
  important: 'focus',
  active: 'focus',
  current: 'focus',
  key: 'focus',
  dim: 'muted',
  secondary: 'muted',
  faded: 'muted',
  minor: 'muted',
  context: 'muted',
};

function isRole(value: string): value is Role {
  return ROLES.some((r) => r === value);
}

function isArrow(value: string): value is Arrow {
  return value === '->' || value === '-->' || value === '<->';
}

export function parseFence(input: FenceInput, report: Reporter): Fence {
  const { grammar, type } = input;
  const fence: Fence = { type, line: input.line, groups: [], phases: [], statements: [], steps: [] };
  const has = (form: LineForm) => grammar.forms.includes(form);
  const knownAttrs = new Set(['role', 'note', ...grammar.attrs]);
  const { error, warn } = report;

  parseHeader(input, fence, report);

  type Open = { kind: 'group'; at: GroupId } | { kind: 'phase'; at: PhaseIndex };
  const open: Open[] = [];
  const top = (): Open | undefined => open.at(-1);
  const current = (): GroupId | undefined => {
    const o = top();
    return o?.kind === 'group' ? o.at : undefined;
  };
  const currentPhase = (): PhaseIndex | undefined => {
    const o = top();
    return o?.kind === 'phase' ? o.at : undefined;
  };
  let inSteps = false;
  const lines = input.body.split('\n');
  for (let k = 0; k < lines.length; k++) {
    const line = input.line + 1 + k;
    const text = stripComment(lines[k]).trim();
    if (!text) continue;

    if (text === 'steps:') {
      if (inSteps)
        error(
          line,
          'A fence has only one `steps:` section.',
          'Delete this line; the steps above and below it belong to the same section.',
        );
      const o = top();
      if (o)
        error(line, `\`steps:\` cannot be inside a ${o.kind}.`, `Close the ${o.kind} with \`}\` before \`steps:\`.`);
      inSteps = true;
      continue;
    }
    if (inSteps) {
      const step = parseStepLine(text, line, report, input.inline);
      if (step) fence.steps.push(step);
      continue;
    }
    if (text === '}') {
      if (!open.length)
        error(line, 'Unexpected `}`: no group is open.', 'Delete it, or open a group with `group "Name" {`.');
      else open.pop();
      continue;
    }
    const reservedSteps = (id: string): boolean => {
      if (id !== 'steps') return false;
      error(
        line,
        '`steps` is a reserved word and cannot be a node id.',
        'Rename the node, e.g. `stages`. To start the walkthrough, write `steps:` alone on its line.',
      );
      return true;
    };
    const phase = /^phase\b\s*(.*)$/.exec(text);
    if (phase && (has('phase') || /\{\s*$/.test(text))) {
      if (!has('phase')) {
        error(
          line,
          `A ${type} has no phases.`,
          `Phases bracket messages in ${list(input.formsElsewhere('phase'))}. Here, use \`group "Name" {\` to box nodes together.`,
        );
        continue;
      }
      const m = /^(?:([a-z0-9_]+(?:-[a-z0-9_]+)*)\s+)?"([^"]*)"\s*\{$/.exec(phase[1]);
      if (!m) {
        error(
          line,
          'A phase needs a quoted name and an opening brace.',
          'Write it as `phase "TLS handshake" {`, or `phase tls "TLS handshake" {` to point at it, with messages on the lines below and `}` on its own line.',
        );
        continue;
      }
      if (current() !== undefined) {
        error(
          line,
          'A phase cannot be inside a group.',
          'Groups box participants and phases bracket messages. Close the group with `}` before the phase.',
        );
        continue;
      }
      const [, id, label] = m;
      if (id !== undefined && reservedSteps(id)) continue;
      const p: FencePhase = { label, line };
      if (id !== undefined) p.id = nodeId(id);
      const parent = currentPhase();
      if (parent !== undefined) p.parent = parent;
      fence.phases.push(p);
      open.push({ kind: 'phase', at: phaseIndex(fence.phases.length - 1) });
      continue;
    }
    const group = /^group\b\s*(.*)$/.exec(text);
    if (group) {
      if (currentPhase() !== undefined) {
        error(
          line,
          'A group cannot be inside a phase.',
          'Groups box participants and phases bracket messages. Put the group above the first phase.',
        );
        continue;
      }
      const m = /^"([^"]*)"\s*\{$/.exec(group[1]);
      if (!m) {
        error(
          line,
          'A group needs a quoted name and an opening brace.',
          'Write it as `group "Name" {`, with members on the lines below and `}` on its own line.',
        );
        continue;
      }
      fence.groups.push(withParent({ label: m[1], line }, current()));
      open.push({ kind: 'group', at: groupId(fence.groups.length - 1) });
      continue;
    }
    const meaning = (attrs: Record<string, string>): Meaning => {
      const out: Meaning = { attrs: new Map(), line };
      const kept = new Map<string, string>();
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'role') {
          if (isRole(value)) out.role = value;
          else {
            const near = ROLE_SYNONYMS[value.toLowerCase()] ?? closest(value, ROLES);
            error(
              line,
              `Unknown role \`${value}\`.`,
              `${near ? `Did you mean \`role=${near}\`? ` : ''}Roles: ${list(ROLES)}.`,
            );
          }
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
              : `${near ? `Did you mean \`${near}\`? ` : ''}Known attributes: ${list(knownAttrs)}.`,
          );
          continue;
        }
        if (key === 'note') out.note = value;
        else kept.set(key, value);
      }
      out.attrs = kept;
      const g = current();
      if (g !== undefined) out.group = g;
      const p = currentPhase();
      if (p !== undefined) out.phase = p;
      return out;
    };
    const reservedLoop = (id: string): boolean => {
      if (has('loop') && id === 'loop') {
        error(
          line,
          `\`loop\` is a reserved word in a ${type} and cannot be a node id.`,
          'Rename the node. To name a feedback loop, write `loop "Name": a -> b -> a`.',
        );
        return true;
      }
      if (has('phase') && id === 'phase') {
        error(
          line,
          `\`phase\` is a reserved word in a ${type} and cannot be a node id.`,
          'Rename the node. To bracket messages, write `phase "Name" {` with the messages on the lines below.',
        );
        return true;
      }
      return false;
    };

    const prop = PROP.exec(text);
    if (prop && !ARROW.test(text.slice(prop[0].length).trim())) {
      const [, node, key] = prop;
      if (!has('prop')) {
        error(
          line,
          `\`${node}.${key}\` is a property, and a ${type} has none.`,
          `Properties (\`node.key : value\`) belong to ${list(input.formsElsewhere('prop'))}. Here, use an edge or a declaration.`,
        );
        continue;
      }
      const { body, attrs } = splitAttrs(text.slice(prop[0].length), line, report);
      const rest = body.trim();
      let value: string | undefined;
      if (rest) {
        const v = /^:\s*("([^"]*)"|\S+)$/.exec(rest);
        if (!v) {
          error(
            line,
            `Cannot read the value of \`${node}.${key}\`.`,
            `Write \`${node}.${key} : value\`, quoting a value with spaces: \`${node}.${key} : "${rest.replace(/^:\s*/, '').replace(/"/g, '')}"\`.`,
          );
          continue;
        }
        value = v[2] ?? v[1];
      }
      if (reservedSteps(node) || reservedSteps(key)) continue;
      const statement: Prop = { type: 'prop', node: nodeId(node), key: nodeId(key), ...meaning(attrs) };
      if (value !== undefined) statement.value = value;
      fence.statements.push(statement);
      continue;
    }

    if (has('loop') && /^loop\b/.test(text)) {
      const m = /^loop\s+(?:([a-z0-9_]+(?:-[a-z0-9_]+)*)\s+)?"([^"]*)"\s*:\s*(.*)$/.exec(text);
      if (!m) {
        error(
          line,
          'A loop needs a quoted name, a colon and a closed chain.',
          'Write it as `loop "Word of mouth": customers -> referrals -> customers`, or `loop wom "Word of mouth": …` to point at it.',
        );
        continue;
      }
      const [, loopId, name, chain] = m;
      if (loopId !== undefined && reservedSteps(loopId)) continue;
      const ids = chain.split(/\s*(?:<->|-->|->)\s*/).map((t) => t.trim());
      const [a, b, ...more] = ids;
      if (ids.length < 3 || ids.some((t) => ID.exec(t)?.[0] !== t)) {
        error(
          line,
          `Cannot read the loop chain \`${chain}\`.`,
          'A loop is a chain of node ids that ends where it starts: `a -> b -> a`.',
        );
        continue;
      }
      const loop: LoopLine = { type: 'loop', name, ends: [nodeId(a), nodeId(b), ...more.map(nodeId)], line };
      if (loopId !== undefined) loop.id = nodeId(loopId);
      fence.statements.push(loop);
      continue;
    }

    const [word, after] = splitWord(text);
    if (has('event')) {
      if (/^\+?\d+(?:\.\d+)?(?:ms|s|sec|min|m|h|d)?$/.test(word) && !looksLikeTime(word) && /^\s+[a-z]/.test(after)) {
        error(
          line,
          `\`${word}\` is a duration or a number, and a ${type} places events at dates or clock times.`,
          `Write a time (${TIME_EXAMPLES}); to show seconds use \`00:00:05\`. For finer steps, leave every time off (\`${after.trim().split(/[\s:]/)[0]}: "Label"\`) and put the duration in the label.`,
        );
        continue;
      }
      if (looksLikeTime(word)) {
        const at = parseTime(word);
        if ('error' in at) {
          error(line, at.error, `Times are written ${TIME_EXAMPLES}.`);
          continue;
        }
        const rest = after.trim();
        if (!rest || ARROW.test(rest)) {
          error(
            line,
            `\`${word}\` is a time, so it cannot be an id in a ${type}.`,
            `An event is a time, then an id: \`${word} launch: "Label"\`. Edges join ids: \`launch -> other\`.`,
          );
          continue;
        }
        const id = readId(rest, line, report, `after the time \`${word}\``);
        if (!id) continue;
        const { body, attrs } = splitAttrs(rest.slice(id.length), line, report);
        const m = /^(?::\s*"([^"]*)")?$/.exec(body.trim());
        if (!m) {
          error(
            line,
            ARROW.test(body.trim())
              ? 'An event line declares one event; it cannot hold an edge.'
              : `Cannot read the event \`${id}\`.`,
            `Write the event as \`${word} ${id}: "Label"\`, and any edge on its own line: \`${id} -> other : caused\`.`,
          );
          continue;
        }
        if (reservedSteps(id)) continue;
        const event: Event = { type: 'event', at, id: nodeId(id), ...meaning(attrs) };
        if (m[1] !== undefined) event.label = m[1];
        fence.statements.push(event);
        continue;
      }
    }

    const first = readId(text, line, report);
    if (!first) continue;
    let rest = text.slice(first.length).trimStart();

    if (rest.startsWith(':')) {
      const { body, attrs } = splitAttrs(rest.slice(1).trim(), line, report);
      const m = /^(?:([A-Za-z][\w-]*))?\s*(?:"([^"]*)")?$/.exec(body.trim());
      if (!m || (!m[1] && m[2] === undefined)) {
        error(
          line,
          `Cannot read the declaration of \`${first}\`.`,
          `Write it as \`${first}: "Label"\`${grammar.kinds.length ? ` or \`${first}: ${grammar.kinds[0]} "Label"\`` : ''}. For an edge, use an arrow: \`${first} -> other\`.`,
        );
        continue;
      }
      if (reservedSteps(first) || reservedLoop(first)) continue;
      if (grammar.reserved.includes(first)) {
        error(
          line,
          `\`${first}\` is a reserved pseudo-state in ${type} and cannot be declared.`,
          `Use it in edges only (\`${first === 'end' ? 'shipped -> end' : 'start -> draft'}\`), or pick another id for a regular state.`,
        );
        continue;
      }
      const [, kind, label] = m;
      const known = kind !== undefined && grammar.kinds.includes(kind);
      if (kind !== undefined && !known) {
        const near = closest(kind, grammar.kinds);
        warn(
          line,
          `Unknown kind \`${kind}\` for ${type}; it will draw as a plain box.`,
          grammar.kinds.length
            ? `${near ? `Did you mean \`${near}\`? ` : ''}Known kinds: ${list(grammar.kinds)}.`
            : `${type} has no node kinds in this version. Write \`${first}: "${label ?? first.replace(/_/g, ' ')}"\`.`,
        );
      }
      const declare: Declare = { type: 'declare', id: nodeId(first), ...meaning(attrs) };
      if (label !== undefined) declare.label = label;
      if (known) declare.kind = kind;
      fence.statements.push(declare);
      continue;
    }

    if (!ARROW.test(rest.replace(/^\.[a-z0-9_-]+\s*/, ''))) {
      const { body, attrs } = splitAttrs(rest, line, report);
      if (body.trim()) {
        if (/^(=>|<-|--|—>|=>|-)/.test(body.trim()))
          error(
            line,
            `Unknown arrow \`${body.trim().split(/\s/)[0]}\`.`,
            'Edges use `->`, `-->` (dashed) or `<->` (both ways).',
          );
        else
          error(
            line,
            `Unexpected text after \`${first}\`: \`${body.trim()}\`.`,
            `A line is an edge (\`${first} -> other : label\`), a declaration (\`${first}: "Label"\`) or a node with attributes (\`${first} {role=focus}\`).`,
          );
        continue;
      }
      if (reservedSteps(first) || reservedLoop(first)) continue;
      fence.statements.push({ type: 'mention', id: nodeId(first), ...meaning(attrs) });
      continue;
    }

    const readKey = (): NodeId | undefined => {
      const k = KEY.exec(rest);
      if (!k) return undefined;
      rest = rest.slice(k[0].length).trimStart();
      return nodeId(k[1]);
    };
    const ends: End[] = [end(first, readKey())];
    const arrows: Arrow[] = [];
    let ok = true;
    for (let a = ARROW.exec(rest); a; a = ARROW.exec(rest)) {
      const arrow = a[1];
      if (!isArrow(arrow)) break;
      arrows.push(arrow);
      rest = rest.slice(arrow.length).trimStart();
      const id = readId(rest, line, report, `after \`${arrow}\``);
      if (!id) {
        ok = false;
        break;
      }
      rest = rest.slice(id.length);
      ends.push(end(id, readKey()));
      rest = rest.trimStart();
    }
    const [e0, e1, ...more] = ends;
    const [a0, ...moreArrows] = arrows;
    if (!ok || !e1 || !a0) continue;
    const keyed = ends.find((e) => e.key !== undefined);
    if (keyed && !has('field')) {
      error(
        line,
        `\`${keyed.node}.${keyed.key}\` names a field, and only ${input.formsElsewhere('field').join(' and ')} edges join fields.`,
        `Join the nodes themselves: \`${ends.map((e) => e.node).join(' -> ')}\`.`,
      );
      continue;
    }
    const { body, attrs } = splitAttrs(rest, line, report);
    let label: string | undefined;
    const tail = body.trim();
    if (tail) {
      if (!tail.startsWith(':')) {
        const [bad] = splitWord(tail);
        if (/^[=<\-—]/.test(bad))
          error(line, `Unknown arrow \`${bad}\`.`, 'Edges use `->`, `-->` (dashed) or `<->` (both ways).');
        else
          error(
            line,
            `Unexpected \`${bad}\` after \`${ends[ends.length - 1].node}\`.`,
            'Put a label after a colon: `a -> b : label`.',
          );
        continue;
      }
      label = unquote(tail.slice(1).trim());
      if (!label) {
        error(line, 'Empty edge label after `:`.', 'Write a label after the colon, or delete the colon.');
        continue;
      }
      if (ends.length > 2) {
        error(
          line,
          'A label on a chain is ambiguous: it is not clear which segment it belongs to.',
          `Give the labelled edge its own line, e.g. \`${ends[ends.length - 2].node} -> ${ends[ends.length - 1].node} : ${label}\`.`,
        );
        continue;
      }
    }
    if (ends.some((e) => reservedSteps(e.node) || reservedLoop(e.node))) continue;
    const chain: Chain = { type: 'chain', ends: [e0, e1, ...more], arrows: [a0, ...moreArrows], ...meaning(attrs) };
    if (label !== undefined) chain.label = label;
    fence.statements.push(chain);
  }
  const unclosed = top();
  if (unclosed?.kind === 'group') {
    const g = fence.groups[unclosed.at];
    error(g.line, `Group "${g.label}" is never closed.`, 'Add `}` on its own line after the last member.');
  } else if (unclosed?.kind === 'phase') {
    const p = fence.phases[unclosed.at];
    error(p.line, `Phase "${p.label}" is never closed.`, 'Add `}` on its own line after its last message.');
  }
  return fence;
}

function withParent(group: FenceGroup, parent: GroupId | undefined): FenceGroup {
  return parent === undefined ? group : { ...group, parent };
}

function end(id: string, key: NodeId | undefined): End {
  return key === undefined ? { node: nodeId(id) } : { node: nodeId(id), key };
}

function splitWord(text: string): [string, string] {
  const m = /^(\S+)(.*)$/.exec(text);
  return m ? [m[1], m[2]] : ['', text];
}

function parseHeader(input: FenceInput, fence: Fence, { error, warn }: Reporter): void {
  const line = input.line;
  let rest = input.info.slice(input.type.length).trim();
  while (rest) {
    const m = /^([A-Za-z_-]+)=("([^"]*)"|\S+)\s*/.exec(rest);
    if (!m) {
      const [word] = splitWord(rest);
      error(
        line,
        `Cannot read \`${word}\` in the fence header.`,
        'Header fields are `key=value`; quote values with spaces: `title="Order lifecycle"`.',
      );
      return;
    }
    rest = rest.slice(m[0].length);
    const key = m[1];
    const value = m[3] ?? m[2];
    if (key === 'id') {
      if (ID.exec(value)?.[0] !== value)
        error(
          line,
          `Diagram id \`${value}\` is not valid.`,
          `Ids use lowercase letters, digits, \`_\` and \`-\`: \`id=${value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}\`.`,
        );
      else fence.id = diagramId(value);
    } else if (key === 'title') fence.title = value;
    else if (key === 'direction') {
      if (value !== 'right' && value !== 'down')
        error(line, `Unknown direction \`${value}\`.`, 'Use `direction=right` or `direction=down`.');
      else if (!input.grammar.directional)
        warn(
          line,
          `\`direction\` has no meaning in a ${input.type}; it is ignored.`,
          'Delete `direction=…` from the header.',
        );
      else fence.direction = value;
    } else {
      const near = closest(key, ['id', 'title', 'direction']);
      warn(
        line,
        `Unknown header field \`${key}\`; it is ignored.`,
        `${near ? `Did you mean \`${near}\`? ` : ''}Header fields: \`id\`, \`title\`, \`direction\`.`,
      );
    }
  }
}

function readId(
  text: string,
  line: number,
  { error }: Reporter,
  where = 'at the start of the line',
): string | undefined {
  const m = ID.exec(text);
  const loose = LOOSE_ID.exec(text);
  if (loose && (!m || loose[0].length > m[0].length)) {
    const fixed = loose[0].toLowerCase();
    error(
      line,
      `Node id \`${loose[0]}\` has uppercase letters.`,
      `Ids are lowercase: use \`${fixed}\`, and declare a label for display: \`${fixed}: "${loose[0]}"\`.`,
    );
    return undefined;
  }
  if (m) return m[0];
  const word = splitWord(text)[0] || '(nothing)';
  if (text.startsWith('"'))
    error(
      line,
      `Expected a node id ${where}, found a quoted label.`,
      'Use an id here and declare its label separately: `paid: "Paid in full"`.',
    );
  else
    error(
      line,
      `Expected a node id ${where}, found \`${word}\`.`,
      'Ids use lowercase letters, digits, `_` and `-`, e.g. `payment_ok`.',
    );
  return undefined;
}

function readEnd(
  text: string,
  line: number,
  report: Reporter,
  where?: string,
): { end: End; length: number } | undefined {
  const id = readId(text, line, report, where);
  if (!id) return undefined;
  const key = KEY.exec(text.slice(id.length));
  return key
    ? { end: end(id, nodeId(key[1])), length: id.length + key[0].length }
    : { end: end(id, undefined), length: id.length };
}

function splitAttrs(text: string, line: number, { error }: Reporter): { body: string; attrs: Record<string, string> } {
  const attrs: Record<string, string> = {};
  const t = text.trimEnd();
  if (!t.endsWith('}')) {
    if (outsideQuotes(t, '{') >= 0)
      error(line, 'Attributes are missing their closing `}`.', 'Close them at the end of the line: `{role=error}`.');
    return { body: text, attrs };
  }
  const open = lastOutsideQuotes(t, '{');
  if (open < 0) {
    error(line, 'Unexpected `}`.', 'Attributes go in braces at the end of a line: `{role=error}`.');
    return { body: text, attrs };
  }
  for (const part of splitOutsideQuotes(t.slice(open + 1, -1), ',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^([A-Za-z_-]+)\s*=\s*("([^"]*)"|[^\s"]+)$/.exec(p);
    if (!m) {
      if (/^[A-Za-z_-]+$/.test(p))
        error(
          line,
          `Attribute \`${p}\` has no value.`,
          `Write \`${p}=value\`${isRole(p) ? `, here \`role=${p}\`` : ''}.`,
        );
      else if (/^[A-Za-z_-]+\s*:/.test(p))
        error(line, `Attributes use \`=\`, not \`:\`: \`${p}\`.`, `Write \`${p.replace(/\s*:\s*/, '=')}\`.`);
      else
        error(
          line,
          `Cannot read attribute \`${p}\`.`,
          'Attributes are `key=value`, separated by commas; quote values with spaces: `{note="retried up to 3 times"}`.',
        );
      continue;
    }
    attrs[m[1]] = m[3] ?? m[2];
  }
  return { body: t.slice(0, open), attrs };
}

function parseStepLine(text: string, line: number, report: Reporter, inline: (s: string) => Html): RawStep | undefined {
  const { error } = report;
  const m = /"([^"]*)"\s*$/.exec(text);
  if (!m || m.index === 0) {
    error(
      line,
      'A step needs a target and a quoted caption.',
      'Write `draft -> submitted "The user submits the cart"`, or `draft "Every order starts here"` for a node.',
    );
    return;
  }
  const caption = inline(m[1]);
  const whole = text.slice(0, m.index).trim();
  const from = readEnd(whole, line, report);
  if (!from) return;
  let target = whole.slice(from.length).trim();
  if (!target) return { from: from.end, caption, line };
  const a = ARROW.exec(target);
  if (!a) {
    error(
      line,
      `Cannot read the step target \`${whole}\`.`,
      'A step names one node (`draft`) or one edge (`draft -> submitted`).',
    );
    return;
  }
  target = target.slice(a[1].length).trim();
  const to = readEnd(target, line, report, `after \`${a[1]}\``);
  if (!to) return;
  target = target.slice(to.length).trim();
  if (!target) return { from: from.end, to: to.end, caption, line };
  if (ARROW.test(target)) {
    error(line, 'A step names a single edge, not a chain.', 'Split it into one step per edge.');
    return;
  }
  if (!target.startsWith(':')) {
    error(
      line,
      `Unexpected \`${target}\` in step.`,
      'To pick one of several edges, add its label: `api -> db : insert "caption"`.',
    );
    return;
  }
  return { from: from.end, to: to.end, label: unquote(target.slice(1).trim()), caption, line };
}

function stripComment(line: string): string {
  if (/^\s*#/.test(line)) return '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === '#' && /\s/.test(line[i - 1] ?? '') && /\s|$/.test(line[i + 1] ?? ''))
      return line.slice(0, i);
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
