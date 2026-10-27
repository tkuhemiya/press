---
name: press
description: Write explanations in Press, a Markdown dialect whose fenced blocks become diagrams (state machines, sequences, architecture, timelines, causal loops, decision trees, ER diagrams, tradeoff tables) with step-by-step walkthroughs. Use when explaining a system, process, decision or comparison where a diagram would be clearer than prose, or when asked to write a Press document.
---

# Writing Press

Press is Markdown with diagram fences. You write the **structure** (what exists, how it
connects, what matters), and Press does the layout, typography and colour. The reader gets
prose and diagrams side by side, a walkthrough on screen, and a compact single frame on paper.

The full language is in `SPEC.md`. This guide covers how to write it *well*.

## The workflow

1. Write the explanation as prose first, then decide which parts a diagram makes clearer.
2. Pick the diagram type from the table below. One idea per diagram.
3. Write the fence, give it an `id` and a `title` if prose will refer to it.
4. Add `steps:` when order matters, and link prose to nodes with `[text](#id.node)`.
5. Run `press check doc.md` and fix every error and warning. Each message names the line
   and gives a fix you can apply as written.

## Choosing a type

| The reader needs to see… | Use |
|---|---|
| States something moves between, and what moves it | `state-machine` |
| Who sends what to whom, in order | `sequence` |
| The parts of a system and how they connect | `architecture` |
| Events in time, gaps, overlapping spans | `timeline` |
| Feedback: why something grows, stalls or oscillates | `causal-loop` |
| Questions that lead to an answer | `decision-tree` |
| Tables, fields and how they reference each other | `er` |
| Options compared on several criteria | `tradeoffs` |

If two types fit, pick the one whose *edges* mean what you want to say. A sequence's edges
are messages in time; an architecture's are standing connections; a state machine's are
transitions.

## Principles

- **Meaning, not styling.** Never describe looks. Use `role` to say what something *is*:
  `focus` (look here), `happy` (the intended path), `error` (failure), `muted` (context).
  Use roles sparingly: one `focus` per diagram, `happy` and `error` only where they carry the
  point. A diagram where everything has a role says nothing.
- **Ids are short and lowercase** (`db`, `user_id`, `payment_ok`). Put the reader-facing text in
  a label: `db: database "Orders DB"`.
- **Labels are short.** A node label is a noun phrase; an edge label a few words. Detail
  belongs in prose or in a step caption. `note` is for a short qualifier under a label.
- **Steps tell the story.** Three to six steps, each a sentence that says *why*, not just
  *what*. Step through the path that matters, not every edge.
- **Prose and diagram work together.** Refer to nodes from the text with
  `[the failed state](#order.failed)`; the reader can hover to see it, and print shows a
  lettered marker.
- **Only `direction` is a layout hint.** Don't fight the layout with extra nodes or ordering
  tricks.

## The shared grammar

```
a -> b : label               edge (--> dashed, <-> both ways)
a -> b -> c                  chain, one edge per segment (no label on a chain)
id: kind "Label" {attrs}     declaration; kind and label are optional
group "Name" { ... }         grouping
node.key : value {attrs}     property (er and tradeoffs only)
# comment
steps:                       last section: one step per line
  a -> b "Caption"
```

## Each type in brief

### state-machine

`start` and `end` are pseudo-states. Mark the success path `happy` and failures `error`.

```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry
paid -> end
```

### sequence

Participants appear in order of first use; `-->` is a reply. When the same two participants
exchange several messages, a step picks one by its label: `api -> db : insert "caption"`.

```sequence
client: user "Browser"
api: service "API"
db: database "Postgres"
client -> api : POST /orders
api -> db : insert
db --> api : ok
api --> client : 201 Created
```

### architecture

Kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. Groups
are boundaries (a network, a trust zone). Edge labels say what travels.

```architecture title="Uploads"
app: client "Web app"
group "VPC" {
  api: service "API"
  jobs: queue "jobs"
}
bucket: storage "Object storage" {role=focus}
app -> api : request URL
app -> bucket : PUT file
bucket --> jobs : object created
```

### timeline

Start an event line with its time (`2019`, `2019-03`, `2019-03-14`, `14:02`,
`2019-03-14T14:02`). Use one kind of time throughout, in order. `{until=…}` makes a span; a
group becomes a band. Leave the times off entirely for an evenly spaced sequence of stages.

```timeline title="Outage"
14:02 deploy: "v2.3 rolls out"
14:09 alerts: "Errors spike" {role=error}
14:12 freeze: "Deploys frozen" {until=14:40, role=muted}
14:21 fixed: "Back to normal" {role=happy}
deploy -> alerts : caused
```

### causal-loop

Every edge label is a polarity: `+` (same direction) or `-` (opposite). Name loops so the
reader sees them; Press works out R (reinforcing) or B (balancing) from the polarities.

```causal-loop title="Word of mouth"
customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : -
loop "Word of mouth": customers -> referrals -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

### decision-tree

Edges are answers, labelled whenever a question has more than one. Nodes with no answers
leaving them are outcomes. One root; branches may rejoin but never loop back.

```decision-tree title="Cache it?"
reads: "Read far more than written?"
stale: "Can readers see stale data?"
cache: "Cache it" {role=happy}
skip: "Don't cache"
reads -> stale : yes
reads -> skip : no
stale -> cache : yes
stale -> skip : no
```

### er

Fields are properties: `entity.field : type`. References go from the referring field to the
referred one, and **every edge states `card`**: each end is `1`, `0..1`, `N` (zero or more)
or `1..N`, read from the first entity to the second.

```er title="Orders"
users.id : uuid {key=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid
orders.user_id -> users.id : placed by {card=N:1}
```

### tradeoffs

Each cell is `option.criterion : value`. Mark how a cell compares with `happy` or `error`, and
the recommended option with `{role=focus}`. Fill every cell; group criteria into categories.

```tradeoffs title="Session storage"
postgres: "Postgres" {role=focus}
cookie: "Signed cookie"
postgres.cost : "already running" {role=happy}
postgres.revoke : instant {role=happy}
cookie.cost : none {role=happy}
cookie.revoke : "at expiry" {role=error}
```

## Common mistakes

| Mistake | Instead |
|---|---|
| `{color=red}`, `{style=bold}` | `{role=error}`, `{role=focus}` |
| A label on a chain: `a -> b -> c : go` | Give the labelled edge its own line |
| Uppercase or spaced ids: `Order DB` | `orders_db: "Order DB"` |
| A step for every edge | Three to six steps along the path that matters |
| An er edge without `card` | `{card=N:1}` |
| A causal edge labelled `increases` | `: +` |
| One diagram explaining two ideas | Two diagrams, each with its own prose |
