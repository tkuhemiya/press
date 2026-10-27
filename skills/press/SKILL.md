---
name: press
description: Use when the user asks for Press, a Press document, or a Press fence. Also use when you are writing or editing an explanation of a system, a process, a decision, or a comparison, and a diagram should carry part of it. Also use when fixing Press source from the messages `press check` prints.
---

# Write Press

Press is Markdown with diagram fences. You write what exists, how it connects, and what matters. Press does the layout, the typography, and the colour. The reader gets prose and diagrams together, a walkthrough on screen, and one frame on paper.

The language is in `docs/SPEC.md`. This file is how to write it well.

## Write in this order

1. Write the explanation as prose.
2. Choose the parts a diagram makes clearer. Use one diagram for one idea.
3. Pick a type from the table below.
4. Write the fence. Set `id` and `title` when prose will refer to the diagram.
5. Add `steps:` when order matters. Link a node from prose with `[text](#id.node)`.
6. Run `press check doc.md`. Fix every error and every warning. Each message names the line and states a fix you can apply as written.

## Choose a type

| The reader needs to see… | Use |
|---|---|
| States something moves between, and what moves it | `state-machine` |
| Who sends what to whom, in order | `sequence` |
| The parts of a system and how they connect | `architecture` |
| Events in time, gaps, overlapping spans | `timeline` |
| Why something grows, stalls, or oscillates | `causal-loop` |
| Questions that lead to an answer | `decision-tree` |
| Tables, fields and how they reference each other | `er` |
| Options compared on several criteria | `tradeoffs` |

If two types fit, pick the one whose edges mean what you want to say. A sequence edge is a message in time. An architecture edge is a standing connection. A state-machine edge is a transition.

**No type fits.** Write that part as prose. Stretch a type only when its edges still mean the same thing. A commit history is a graph of commits, so `architecture` with `direction=right` draws it honestly. Stop when the picture needs something the type lacks. Press has no type yet for quantities on axes, such as supply and demand or temperature over time. It also has no type for bytes in memory, parallel lanes, or claims and rebuttals.

## Principles

- **Meaning, not styling.** Never describe looks. `role` says what something is. `focus` means look here. `happy` means the intended path. `error` means failure. `muted` means context. Use one `focus` per diagram. Use `happy` and `error` only where they carry the point. A diagram where every node has a role says nothing.
- **Ids are short and lowercase.** `db`, `user_id`, and `payment_ok` are ids. Put the reader-facing text in a label, as in `db: database "Orders DB"`. Press draws an undeclared id as words, so `wage_demands` reads "wage demands". Declare a label when you need capitals, symbols, or different wording. Causal-loop variables and tradeoffs criteria take `id: "Label"` the same way.
- **Labels are short.** A node label is a noun phrase. An edge label is a few words. Put detail in prose or in a step caption. `note` is a short qualifier under a label.
- **Steps tell the story.** Use three to six steps. Each caption says why the move happens. Step through the path that matters. Leave the other edges out of `steps:`.
- **Prose and the diagram work together.** Point at a node from the text with `[the failed state](#order.failed)`. On screen, the reader hovers the link and Press highlights that node. On paper, the reference is a lettered marker.
- **`direction` is the only layout hint.** Leave it out unless you have a reason. Press picks the direction that fits the page. Put it in the fence header, as in `` ```architecture direction=down ``. Do not add extra nodes, or reorder lines, to push the layout around.

## The shared grammar

```
a -> b : label               edge. --> is dashed. <-> goes both ways.
a -> b -> c                  chain. One edge per segment. No label on a chain.
id: kind "Label" {attrs}     declaration. kind and label are optional.
id {note="short qualifier"}  a note prints small, under the label
group "Name" { ... }         grouping
node.key : value {attrs}     property, in er and tradeoffs only
# comment
steps:                       last section. One step per line.
  a -> b "Caption"           a step on an edge
  a "Caption"                a step on one node, or on a property such as x.y "Caption"
```

The fence header holds `id=`, `title="…"`, and `direction=right` or `direction=down`. Steps work in every type. If two edges join the same pair, name the one you mean by its label, as in `api -> db : insert "Caption"`. A request written `->` and its reply written `-->` are the same pair.

## Each type

### state-machine

`start` and `end` are pseudo-states. Mark the success path `happy`. Mark failures `error`.

```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry
paid -> end
```

### sequence

Participants appear in order of first use. `-->` is a reply. The kinds are `user`, `service`, `database`, `queue`, and `external`. Sequence has no `client` kind. A plain declaration draws a plain box. `group "Name" { ... }` boxes participants together. You cannot yet bracket a run of messages into a phase. Put phases in step captions or in prose.

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

The kinds are `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, and `user`. A group is a boundary, such as a network or a trust zone. An edge label says what travels.

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

Start an event line with its time. The forms are `2019`, `2019-03`, `2019-03-14`, `14:02`, `14:02:30`, and `2019-03-14T14:02`. Use one form throughout, and keep the lines in order. A duration such as `180ms` is not a time. `{until=…}` makes a span. A group becomes a shaded band across the time its members cover. The band marks a window. It does not draw a parallel lane. Leave the times off when you want evenly spaced stages.

```timeline title="Outage"
14:02 deploy: "v2.3 rolls out"
14:09 alerts: "Errors spike" {role=error}
14:12 freeze: "Deploys frozen" {until=14:40, role=muted}
14:21 fixed: "Back to normal" {role=happy}
deploy -> alerts : caused
```

### causal-loop

Every edge label is a polarity. `+` means the same direction. `-` means the opposite direction. `{delay=yes}` marks a delayed link with ‖. Name each loop so the reader can see it. Press marks the loop R when it reinforces, and B when it balances. Declare a variable with a label, as in `rate: "Interest rate"`.

```causal-loop title="Word of mouth"
customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : -
loop "Word of mouth": customers -> referrals -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

### decision-tree

Edges are answers. Label an edge when a question has more than one answer. A node with no answers leaving it is an outcome. Use one root. Branches may rejoin. A branch must not loop back.

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

Fields are properties, written `entity.field : type`. A reference goes from the referring field to the referred field. Every edge states `card`. Each end is `1`, `0..1`, `N`, or `1..N`. `N` means zero or more. Read `card` from the first entity to the second.

```er title="Orders"
users.id : uuid {key=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid {null=yes}
orders.user_id -> users.id : placed by {card=N:0..1}

steps:
  orders.user_id -> users.id "An order may have no user yet, as for a guest checkout."
```

Field attributes are `{key=yes}`, `{unique=yes}`, and `{null=yes}`. They describe the field. The crow's feet follow `card`.

### tradeoffs

Each cell is `option.criterion : value`. Mark a cell with `happy` or `error`. Use `muted` when the cell is not relevant. Mark the recommended option with `{role=focus}`. Fill every cell. Name a criterion with a declaration, as in `revoke: "Revoke at once"`. To put criteria in a category, either list their ids in the group, or write their cells inside the group. Listing ids looks like `group "Security" {`, then `revoke`, then `}`.

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
| A causal edge drawn through an extra node to mean "slowly" | `{delay=yes}` |
| Timeline groups used as parallel lanes | One band per window. Lanes need prose for now |
| A causal edge labelled `increases` | `: +` |
| One diagram explaining two ideas | Two diagrams, each with its own prose |
