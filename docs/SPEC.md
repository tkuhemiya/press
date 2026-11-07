# Press language spec (draft, v0.4)

## Document

A Press document is CommonMark. A fenced code block whose language tag is a known diagram type is rendered as that diagram. All other fences are ordinary code blocks.

Fence header:

````
```<type> id=<name> title="<title>" direction=<right|down>
````

All header fields are optional. `id` is needed only when prose refers to the diagram. Without `direction`, a type draws in its default direction, or in the other one when that fits the page clearly better; an explicit `direction` is always kept.

## Shared grammar

Every diagram type uses these forms.

```
a -> b : label                 edge
a --> b                        dashed edge (return, async, weak)
a <-> b                        bidirectional edge
a -> b -> c                    chain: one edge per segment
id: kind "Label"               explicit node declaration (optional)
group "Name" { ... }           nesting
... {key=value, key=value}     trailing attributes on a node or edge
# comment
```

- Nodes are created by first use. Declare one explicitly only to give it a kind or a label that differs from its id. The kind is optional: `id: "Label"`. An undeclared node is labelled with its id, `_` read as a space (`wage_demands` shows as "wage demands"); in `er` an entity's id is a table name and shows as written.
- A group with no members is a warning, since it would draw nothing.
- A node belongs to the group it is declared in. A bare node line inside a group (`api` alone) moves an existing node into that group, so members can be listed after they are declared.
- A line may hold just a node and its attributes: `draft {role=focus}`.
- Ids are lowercase letters, digits, `_` and `-`. A `-` must sit between two other characters, so `a-->b` reads as an edge, never as an id. Labels are quoted strings.
- Values containing spaces are quoted: `{note="retried up to 3 times"}`.
- `note` is the one attribute besides `role` that every type accepts. A node's note prints in small type under its label; it is for a short qualifier, not a sentence. `er` keeps it in the source but does not draw it; in `tradeoffs` a cell's note is its caveat.
- Chains may mix arrows (`a -> b --> c`). Attributes at the end of a chain apply to every segment, so `start -> draft -> paid {role=happy}` marks a whole path. A label is ambiguous on a chain and is an error; give the labelled edge its own line.
- `steps` is a reserved word in every diagram type, and each type may reserve more (see its keywords). Using one as a node id is an error.

### Roles

`role` is the main attribute. It carries meaning and the renderer decides how it looks.

| Role    | Meaning                          |
|---------|----------------------------------|
| `focus` | The thing the reader should look at |
| `error` | Failure path or bad state        |
| `happy` | The intended / success path      |
| `muted` | Present for context, not central |

### Properties

*New in v0.3, used by `er` and `tradeoffs`.* A property is a named value that belongs to a node:

```
node.key : value {attrs}
```

- `node` is created by first use, like any node. `key` is an id. The value is a single word or a quoted string, and it is optional where the type allows it.
- In `er` a property is a field of an entity (`orders.user_id : uuid`). In `tradeoffs` it is a cell: what one option offers on one criterion (`redis.ops : "another service"`).
- Roles work on properties as on nodes: `{role=happy}` marks a favourable value, `{role=error}` an unfavourable one.
- A type that has no properties reports `a.b` as an error that names the types that do.

## Steps

A `steps:` section at the end of a fence walks the reader through the diagram in order. Each line references an existing edge or a single node and gives a caption. A node step highlights that node, for example to point at a state before any transition happens.

```
steps:
  draft                  "Every order starts as a draft"
  draft -> submitted     "The user submits the cart"
  submitted -> failed    "The card is declined"
  failed -> submitted    "They retry with a new card"
```

In types with properties, a step can also name one (`redis.ops "caption"`), and in `er` an edge between two fields (`orders.user_id -> users.id "caption"`). A step can also name a sequence phase or a causal loop by its id (`tcp "caption"`); it highlights the phase or loop and everything in it.

When more than one edge joins the same two nodes, as with repeated messages in a `sequence`, the step names the edge by its label: `api -> db : insert "caption"`. If the step is still ambiguous, the parser reports an error that lists the matching edges. `->` and `-->` are interchangeable in a step.

## Prose references

Prose links into a diagram with standard Markdown link syntax: `[text](#<diagram-id>.<node-id>)`.

```
When the card is declined, [the failed state](#order.failed) loops back.
```

In types with properties, a reference can name one: `[the foreign key](#shop.orders.user_id)`.

*New in v0.4.* A reference can also name:

- **An edge**, by its two ends: `[the retry](#order.failed->submitted)`. If more than one edge joins the two, the reference is ambiguous and is an error. In a sequence, put the message in a phase and point at the phase.
- **A sequence phase or a causal loop**, by its id: `[the handshake](#req.tcp)`, `[word of mouth](#growth.wom)`.

On screen, hovering highlights the edge, or the phase or loop with everything in it. On paper, the letter sits beside the edge label, or at the corner of the phase or loop.

## Rendering targets

### HTML

- `steps` become an interactive walkthrough: next/previous, with the current edge highlighted and the caption shown.
- Hovering a prose reference highlights what it names: a node, an edge, or a phase or loop.

### Print

Paper is a budget. A diagram should not take more space on paper than it does on screen, and print must never expand one diagram into a frame per step.

- **Steps compress into one frame.** Each step's edge gets a small numbered marker, and the captions become a compact numbered legend beside or under the diagram.
- **Prose references become markers.** A reference prints as the text plus a superscript marker that matches a marker on the node. Step markers are numbers (1, 2, 3); prose reference markers are letters (a, b, c), so the two never collide.
- **A figure that would print small may print differently.** Press tries it in the other direction (only when the author gave no `direction`) and without its `muted` elements (only when no step or prose reference points at one), and prints whichever layout keeps the text largest. The screen always shows the diagram as written.
- **Diagrams never split across pages.**

Small multiples (several frames) are allowed only when the author asks for them explicitly. This is not part of v0.1.

## Diagram types in v0.1

See `VISUALIZATIONS.md` for the full list and status.

### `state-machine`

Keywords: `start`, `end` (pseudo-states). Both are reserved and cannot be used as state ids.

Node kinds: none in v0.1. A declaration gives only a label: `paid: "Paid in full"`.

```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry
paid -> shipped : ship
shipped -> end
```

### `sequence`

Participants appear left to right in order of first use. Edges are messages, top to bottom. `-->` is a reply or async message.

Node kinds: `user`, `client`, `service`, `database`, `queue`, `external`, the same names as in `architecture`. `group "Name" { ... }` draws a labelled box around the participants it contains. `direction` has no meaning here; the parser ignores it with a warning.

Keyword: `phase`, reserved. *New in v0.4.*

```
phase <id> "Label" {
  a -> b : message
}
```

- A phase brackets the messages written inside it: a handshake, a round trip, "async from here". It draws as a labelled frame across all the lifelines, from its first message to its last.
- The id is optional. Give one to point at the phase from a step or from prose. Phase ids share the namespace with participants, so a phase cannot reuse a participant's id.
- Phases nest. Closing a phase with `}` returns to the one around it.
- A phase covers messages only. A participant first used inside a phase is still a top-level participant. A `group` cannot be inside a phase, and a phase cannot be inside a `group`, because groups box participants.
- A phase with no messages is a warning, since it would draw nothing.
- To say "everything from here on", put the remaining messages in one phase that runs to the end of the fence.

```sequence
client -> api : POST /orders
phase "In the request" {
  api -> db : insert
  db --> api : ok
}
api --> queue : order.created
api --> client : 201 Created
```

## Diagram types in v0.2

### `architecture`

Components, the boundaries around them, and the connections between them. Edges are connections; the label says what travels on them (a protocol, a payload). `-->` is an async or fire-and-forget connection. Groups are boundaries: a network, a trust zone, a deployment. `direction` defaults to `right`.

Node kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. Each draws with its own shape or icon. A node without a kind draws as a plain component box.

```architecture id=checkout title="Checkout"
user: user "Shopper"
web: client "Storefront"
stripe: external "Stripe"

group "VPC" {
  api: service "Orders API"
  db: database "Postgres"
  events: queue "order-events"
}

user -> web
web -> api : HTTPS
api -> db : SQL
api --> events : order.created
api -> stripe : charge {role=focus}

steps:
  web -> api       "The storefront posts the order"
  api -> stripe    "The API charges the card before anything is stored"
  api -> db        "Only a paid order is written"
```

### `causal-loop`

Variables and the causal links between them, for feedback. In this type **the edge label is the polarity**: `+` (the two move the same way) or `-` (they move in opposite ways). Every edge needs one, and any other label is an error. `<->` is not allowed: a mutual influence is two edges, often with different polarities. `-->` marks a weak or uncertain link.

Keyword: `loop`, reserved.

- `{delay=yes}` on an edge marks a delay, drawn with the standard ‖ mark. `yes` is the only value; leave the attribute out when there is no delay.
- A variable cannot link to itself (`a -> a`). Name what carries the effect and route the link through it.
- `loop "Name": a -> b -> a` names a feedback loop. `loop wom "Name": …` gives it an id, so steps and prose can point at it; loop ids share the namespace with variables. The chain must close (it ends where it starts) and each segment must be an edge in the diagram. **Press works out the loop's type from the edge polarities**: an even number of `-` makes it reinforcing (R), an odd number balancing (B). Loops are numbered in order (R1, R2, B1) and marked inside the diagram with their name.
- `direction` has no meaning here; the parser ignores it with a warning.
- Layout keeps each named loop open, with its mark inside: a circular arrow turning the way the loop runs, its number, and its name. A two-variable loop draws as a lens.

Node kinds: none. A declaration gives only a label.

```causal-loop id=growth title="Word of mouth"
customers: "Customers"
referrals: "Referrals"
saturation: "Market saturation"

customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : -
price -> customers : - {delay=yes}

loop "Word of mouth": customers -> referrals -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

### `timeline`

Events in order. This type adds one line form, the event, with the time first so the source reads as a timeline:

```
<when> id: "Label" {attrs}
```

`<when>` is one of:

| Form | Example |
|---|---|
| year | `2019` |
| month | `2019-03` |
| day | `2019-03-14` |
| clock time | `14:02`, `14:02:30` |
| date and time | `2019-03-14T14:02` |
| time since the start | `0ms`, `+150ms`, `+1.5s`, `+2min`, `+3h`, `+2d` |

- The label is optional, as in any declaration: `14:02 deploy` is an event labelled `deploy`.
- Each event's card shows its time, written out for reading: `14:02`, `Mar 2019`, `14 Mar 2019`, `14 Mar 2019, 14:02`.
- Spacing follows real time. Calendar forms (the first three and date-and-time) may be mixed in one fence; clock times and times since the start may not be mixed with each other or with calendar forms.
- *New in v0.4.* A time since the start is a number and a unit (`ms`, `s`, `min`, `h`, `d`), with an optional leading `+`. Use it for latencies and timeouts, where only the gaps matter. A number with no unit, or `m` for minutes, is an error that suggests the unit.
- Events are expected in chronological order. An event earlier than the one above it is a warning, since it is usually a typo.
- `{until=<when>}` makes an event a span that lasts until that time: a deploy freeze, an outage. `until` takes the same form as the event's own time and may not be earlier.
- A group becomes a span covering its members: an era, an impact window.
- Edges join events, for cause: `deploy -> alerts : caused`.
- **Undated timelines.** If no event has a `<when>`, events are ordinary node declarations (`id: "Label"`) and are spaced evenly in source order. A fence is either dated or undated; mixing the two is an error, and `until` needs a dated timeline.
- `direction=right` (the default) runs time left to right; `direction=down` runs it top to bottom, for many events or long labels.
- In a timeline, a line that starts with a `<when>` is an event, so ids cannot themselves be dates.

**Lanes.** *New in v0.4.* Keyword: `lane`, reserved.

```
lane "Server B" {
  +150ms wait: "Waits" {until=180ms}
  +180ms fire: "Becomes candidate"
}
```

- A lane is a parallel track: one server, one spacecraft, one git branch. Lanes stack top to bottom in source order and share one time axis.
- Once a fence has a lane, every event belongs to one. An event belongs to the lane it is declared or first used in.
- Events are expected in order within each lane, not across lanes.
- Edges join events in the same lane or in different lanes: a message, a merge, a handover.
- Lanes do not nest, and a lane cannot be inside a group or hold one. A group lists its members by id after the lanes, and draws as a window across all of them.
- In an undated timeline with lanes, events are spaced in an order that respects both each lane's order and the edges, so `c1 -> f1 : branch` puts `f1` after `c1`.
- A timeline with lanes runs left to right; `direction=down` is ignored with a warning.

Node kinds: none.

```timeline id=incident title="Outage, 14 March"
14:02 deploy: "v2.3 rolls out"
14:09 alerts: "Error rate hits 8%" {role=error}
14:12 freeze: "Deploys frozen" {until=14:40, role=muted}
14:15 rollback: "Rollback starts"
14:21 recovered: "Errors back to baseline" {role=happy}

group "Impact window" {
  alerts
  rollback
  recovered
}

deploy -> alerts : caused
```

## Diagram types in v0.3

### `decision-tree`

Questions, the answers that branch from them, and the outcomes they lead to. Edges are answers, and the label is the answer (`yes`, `under 1 GB`). `direction` defaults to `down`.

- **Questions and outcomes follow from structure.** A node with outgoing edges is a question; a node with none is an outcome and draws as one. There are no kinds to declare.
- There is exactly one root, the node nothing leads to. Two roots is an error that names both.
- Branches may rejoin (two answers can lead to the same outcome), but a path may not loop back: that is an error that suggests a `state-machine`.
- Every edge from a question with more than one answer needs a label. A missing one is an error, since the reader cannot tell the branches apart.
- `-->` marks a weaker or rarer branch and draws dashed. `<->` is an error.
- Roles mark the outcomes: `{role=happy}` for the recommended one, `{role=error}` for one to avoid. `steps` walk one path from the root.

```decision-tree id=cache title="Should this be cached?"
reads: "Read far more than written?"
stale: "Can readers see stale data?"
cost: "Slow or costly to compute?"
cache: "Cache it" {role=happy}
skip: "Don't cache"
fix: "Fix the query first"

reads -> stale : yes
reads -> skip : no
stale -> cost : yes
stale -> skip : no
cost -> cache : yes
cost --> fix : no

steps:
  reads -> stale   "Caching only pays when reads dominate."
  stale -> cost    "A cache serves old data for a while; the product must allow that."
  cost -> cache    "And it must save real work."
```

### `er`

Entities, their fields, and the references between them. Fields are properties: `entity.field : type {attrs}`. The type is free text (`uuid`, `text`, `"numeric(10,2)"`), shown in small type beside the field name. `direction` defaults to `right`.

- Field attributes: `{key=yes}` marks the primary key, `{unique=yes}` a unique field, `{null=yes}` a field that may be empty. Fields draw in source order, keys first.
- **A reference is an edge between two fields**, from the field that refers to the field it refers to: `orders.user_id -> users.id {card=N:1}`. **`card` is required on every edge** and says how many of each side take part, read from the first entity to the second. Each end is one of `1` (exactly one), `0..1` (zero or one), `N` (zero or more) or `1..N` (one or more), so `N:1` reads "many orders, each with exactly one user". Ends are drawn with crow's-foot marks. Both fields must be declared as properties.
- **Entity-level edges** are for conceptual models that have no fields yet: `users -> teams : member of {card=N:N}`.
- `key`, `unique` and `null` describe fields only; they do not change the drawn cardinality, which is always the one written.
- An edge label is the relationship's name (`places`, `belongs to`).
- `<->` is an error: a reference has a direction. Groups are schemas or bounded contexts.
- A declaration gives an entity its display name: `users: "User"`. Node kinds: none.

```er id=shop title="Orders"
users: "User"
orders: "Order"
items: "Line item"

users.id : uuid {key=yes}
users.email : text {unique=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid
orders.coupon_id : uuid {null=yes}
orders.placed_at : timestamp
items.order_id : uuid
items.sku : text
items.qty : int

coupons.id : uuid {key=yes}
coupons.code : text {unique=yes}

orders.user_id -> users.id : placed by {card=N:1}
orders.coupon_id -> coupons.id {card=N:0..1}
items.order_id -> orders.id : belongs to {card=1..N:1}
```

Here every order is placed by exactly one user and a user has any number of orders; an order has at most one coupon; and every order has at least one line item.

### `tradeoffs`

Options compared across criteria. Each cell is a property: `option.criterion : value {attrs}`. The node on the left of the dot is an option, the key on the right a criterion; declarations give either a display name. There are no edges: an edge is an error that says so.

- The value is short text: `"<1 ms"`, `yes`, `"another service"`. A cell's role says how it compares: `{role=happy}` favourable, `{role=error}` unfavourable, no role neutral, `{role=muted}` not relevant.
- *New in v0.4.* A cell's `note` is its caveat, printed small under the value: `mongo.tx : yes {note="multi-document since 4.0"}`. A neutral cell with a note is marked with a hollow ring: neither good nor bad, but read the small print. Favourable and unfavourable cells stay distinct in grayscale: a filled mark and a hatched cell.
- `{role=focus}` on an option marks the recommendation, and its column is drawn as chosen.
- Options and criteria appear in order of first use. A declared id that no cell uses is a warning. A missing cell draws as a dash and is a warning that names it, since a comparison with gaps is usually unfinished.
- A group of criteria is a category (`group "Operations" { ops  revoke }`) and draws as a band of rows.
- `direction=right` (the default) puts options across the top and criteria down the side; `direction=down` swaps them, for many options.
- Steps and prose references can name an option, a criterion or a cell (`redis.ops`).

```tradeoffs id=sessions title="Where to keep sessions"
redis: "Redis"
postgres: "Postgres" {role=focus}
cookie: "Signed cookie"

latency: "Read latency"
ops: "Running cost"
revoke: "Revoke at once"

redis.latency : "<1 ms" {role=happy}
redis.ops : "another service" {role=error}
redis.revoke : yes {role=happy}
postgres.latency : "~2 ms"
postgres.ops : "already running" {role=happy}
postgres.revoke : yes {role=happy}
cookie.latency : none {role=happy}
cookie.ops : none {role=happy}
cookie.revoke : "not before expiry" {role=error}

steps:
  revoke             "The deciding question: can we log someone out right now?"
  cookie.revoke      "A signed cookie stays valid until it expires."
  postgres           "Postgres revokes at once and is already running."
```

## Diagram types in v0.9 (draft, not yet agreed)

Two types for how a program runs: the calls on its stack over time, and the bytes of its data. Both use the shared grammar and add no new line forms. Changes (`+` and `-`) are an error in both types in v0.9.

### `call-stack`

Frames on one thread's stack, over time. A frame is a node, and its label is the call as a reader would write it (`"factorial(3)"`). Edges are the events that change the stack: **`a -> b` means `a` calls `b`**, and **`b --> a : value` means `b` returns to `a`**, with what it returns as the label. Events happen in source order.

- **The first frame is the bottom of the stack**, and it is the only frame nothing calls.
- **Only the frame on top can call or return.** A call from any other frame is an error that names the frame on top and suggests the line it may have meant. A frame is called once; calling it again is an error that suggests a new id for the second call (`log_2: "log()"`).
- **A return to a frame below the caller unwinds the frames between.** They end at that moment without a value and draw cut off. Give the return `{role=error}` to show a thrown exception.
- **A frame that never returns stays open** to the right edge. That is how a fence shows the stack at one moment, such as the moment of a crash; mark the failing frame `{role=error}`.
- **Time is order, not duration.** Events are evenly spaced. For real durations, use a `timeline`.
- A frame's `note` prints small under its label, for the locals that matter (`{note="n = 3"}`).
- `direction=right` (the default) runs time left to right with deeper frames lower; `direction=down` runs time down the page with deeper frames to the right.
- Steps name an event (`f2 -> f1`, `f1 --> f2`) or a frame. An event step marks that moment across the whole figure, so the reader sees the stack as it stood; a frame step highlights the frame for as long as it lives.
- Groups, `<->` and properties are errors. Node kinds: none. One fence draws one thread; for several threads or async work, use a `sequence`.

```call-stack id=fact title="factorial(3)"
f3: "factorial(3)"
f2: "factorial(2)"
f1: "factorial(1)"

main -> f3
f3 -> f2
f2 -> f1
f1 --> f2 : 1
f2 --> f3 : 2
f3 --> main : 6

steps:
  main -> f3     "main asks for 3!"
  f2 -> f1       "Each call waits on a smaller one"
  f1 --> f2      "The base case returns without calling again"
  f3 --> main    "The answers multiply on the way back"
```

### `memory-layout`

The bytes of a value: its fields, their offsets, the padding between them, and the pointers out of it. A node is a block of memory, such as a struct, a stack frame or a heap allocation. Its fields are properties, written in memory order: `block.field : type {attrs}`.

- **Press does not lay out the struct; the author does.** Press never reads code, and layout depends on the language and its rules. Fields are placed one after another in the order written, so a gap is written as a field of type `padding` with a size: `order.pad : padding {size=3}`.
- **Sizes come from the type.** `bool`, `u8`, `i8` are 1 byte; `u16`, `i16` 2; `u32`, `i32`, `f32` 4; `u64`, `i64`, `f64`, `usize`, `isize` and a pointer (`ptr`, or any type ending in `*`) 8. An array of a known type gives its count: `"u8[24]"`. Any other type needs `{size=N}`, and leaving it out is an error that names the field and shows the form.
- **Misaligned fields are a warning.** A field of a known type whose offset is not a multiple of its size names the field, its offset, and the padding that would align it. `{packed=yes}` on a block turns the warning off.
- **Rows are eight bytes**, one 64-bit word, so alignment reads as columns. Offsets print at the start of each row and each field. A field longer than two rows draws its first and last rows with a break between them.
- **Pointers are edges** from a field to the block or field they point at: `node.next -> other`. A null pointer is a field with `{note=null}` and no edge.
- **Groups are regions** of memory (`group "Stack" { … }`, `group "Heap" { … }`), drawn side by side.
- Steps and prose references name a block, a field (`order.total`) or a pointer. `direction` has no meaning here; the parser ignores it with a warning. Node kinds: none.

```memory-layout id=order title="struct Order, 16 bytes"
order: "Order"
order.id : u64
order.paid : bool
order.pad : padding {size=3}
order.total : u32
```

## Node kinds

Each diagram type has a fixed list of node kinds, and each kind has a designed shape or icon. The list is closed so that every kind looks good. A kind the renderer doesn't know draws as a plain box, and the parser emits a warning naming the known kinds. To add a kind, add it to the spec.

`architecture` kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. `sequence` uses the same names (in v0.2, a subset: `user`, `service`, `database`, `queue`, `external`).
