# Press language spec (draft, v0.11)

## Document

A Press document is CommonMark. A fenced code block whose language tag is a known diagram type is rendered as that diagram. All other fences are ordinary code blocks. Press warns when such a fence looks like a mistake: its tag is close to a diagram type, or its body has edge lines such as `a -> b` (unless the tag is `text` or `markdown`, which show source verbatim).

Fence header:

````
```<type> id=<name> title="<title>" direction=<right|down>
````

All header fields are optional. `id` is needed only when prose refers to the diagram. Without `direction`, a type draws in its default direction, or in the other one when that fits the page clearly better; an explicit `direction` is always kept.

### Page hints

*New in v0.5.* A heading may end with `{page=keep}` or `{page=new}`. A section is a heading and everything under it, up to the next heading of any level.

```markdown
## Where the writes go {page=keep}
## Appendix: wire formats {page=new}
```

- `page=keep` keeps the section on one page. Press shrinks its figures as far as print allows to make it fit, and starts a new page if it does not fit in the space left. A section too long for any page flows normally, and `press build` warns that it could not keep it together.
- `page=new` starts the section on a new page.
- Hints affect print only. On screen the heading shows without its hint.
- Any other key or value is an error that names the line and the accepted values. Without a hint, Press lays out print on its own (see Print below).

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
- Groups draw as tinted regions with a soft border. A nested group is tinted a little darker than its parent, to three levels, so depth reads without heavy strokes.
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

Green and red are reserved for diffs. `happy` and `error` look like ordinary nodes, so they do not add colour. `focus` is a blue ring; `muted` is a faint line.

### Properties

*New in v0.3, used by `er` and `tradeoffs`.* A property is a named value that belongs to a node:

```
node.key : value {attrs}
```

- `node` is created by first use, like any node. `key` is an id. The value is a single word or a quoted string, and it is optional where the type allows it.
- In `er` a property is a field of an entity (`orders.user_id : uuid`). In `tradeoffs` it is a cell: what one option offers on one criterion (`redis.ops : "another service"`). In `class` it is a field or, with `{op=yes}`, a method (`order.submit : void {op=yes}`).
- Roles work on properties as on nodes: `{role=happy}` marks a favourable value, `{role=error}` an unfavourable one.
- A type that has no properties reports `a.b` as an error that names the types that do.

### Changes

*New in v0.8.* A fence can show a change, the way a diff does. A statement line may start with `+` and a space, meaning it exists after the change, or `-` and a space, meaning it existed before. An unmarked line exists on both sides.

```
draft -> submitted : submit
- submitted -> failed : declined
+ submitted -> review : needs review
- paid: "Paid"
+ paid: "Paid in full"
```

- Every statement can be marked: declarations, edges and chains, properties, events and loops. `group`, `phase` and `lane` lines, a closing `}` and steps cannot, and are an error that says so.
- An edge, property or loop has the status of its own line.
- A node is added when only `+` lines mention it, and removed when only `-` lines do. A node that any unmarked line mentions existed before and after, so a new node's other lines need a `+` too.
- A `-` line and a `+` line that declare the same id, or give the same property, are the old and new versions of one element. *Changed in v0.11:* nothing is drawn as "changed". The old version draws as a removal and the new one as an addition, the way git shows an edited line as a `-` line followed by a `+` line.
- A group, phase or lane takes its status from what it holds: added when everything in it is added, removed when everything in it is removed.
- An unmarked causal loop that runs through a removed link is a warning, since that loop no longer exists after the change.
- **Two kinds of change, never three.** *Changed in v0.11.* Removed things draw red and dashed, and their labels start with `−`. Added things draw green, and their labels start with `+`. There is no third colour, no `~` mark and no `was` note. The `+` and `−` make a diff read without colour. A change draws in its change colour instead of its role colour. A key under the figure names the kinds of change it shows.
- **Graph and row types split into Before and After.** *Changed in v0.11.* A diff in `state-machine`, `sequence`, `architecture`, `data-flow`, `c4`, `deployment`, `causal-loop`, `decision-tree` or `timeline` draws as two aligned panels, Before on the left and After on the right, from one layout of the union. This holds on screen, in images, on paper and in the terminal. Before shows the context in ink and removed things in red; After shows the context and added things in green. A hole stays where an element exists on only one side, so shared elements sit in the same place in both. A renamed node shows its old label, red, on the left and its new label, green, on the right. The panel headers read `− Before` and `+ After`.
- **Table types stay one figure, with rows like a unified diff.** *Changed in v0.11.* In `er`, `tradeoffs`, `class` and `dependency` an added row (a field, a member, a criterion, a module) is green and a removed one is red and struck through. An edited field or member is two rows: the old one in red, then the new one in green. An edited `tradeoffs` cell holds two lines, the old value in red and struck through, above the new value in green. A `dependency` cell whose mark changes shows the old mark in red and the new mark in green side by side. A renamed entity, class, option or module shows its old name in red above its new name in green.
- **Fitting the panels.** The pair is one figure. In print it scales down to fit the page like any figure, after trying the other direction when the author gave none; a pair that fits only below the 60% floor still prints scaled to fit, and `press build` warns that the diff is too wide to read and suggests cutting the fence down to the part that changed. Images are sized to the drawing, so the pair is never scaled. In the terminal the panels sit side by side when both fit the width, and otherwise Before prints above After; a panel that cannot fit on its own falls back as any terminal figure does.
- **Steps and prose references** work as usual and may point at removed elements. Their marker appears in each panel that holds the element: Before for a removed one, After for an added one, both for one that is unchanged.

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
- **Diagrams never split across pages.** A diff's Before and After panels are one figure and stay on one page (see Changes).
- **Figures fill the page they are on.** A figure that does not fit in the space left on its page prints smaller, down to 60% of its size, or in its other direction, before it moves to the next page. Figures never move out of reading order, and a heading never ends a page alone.

### Images

*New in v0.5.* `press build doc.md -o doc.png` (or `.webp`, `.jpg`, `.svg`) typesets each figure as its own page, sized to the drawing (Typst `page` width and height `auto`), not to A4. Every image format uses the same print marks as the PDF, so a figure cannot drift from paper. Surrounding prose, page numbers and leftover sheet are omitted. The figure title is kept. Steps stay as numbered markers on the drawing; their captions are not repeated as a legend.

- **One file per figure.** A document with one figure writes the path given in `-o`. Several figures write `name-1.png`, `name-2.png`, … next to it (and the same for `.webp`, `.jpg`, `.svg`).
- **SVG is Typst’s print SVG**, with colours and type resolved, not the class-only SVG inside the HTML page. The HTML SVG needs the page stylesheet; the export does not.
- **Raster density.** `--ppi` defaults to 144 (two pixels per PostScript point). It must be an integer from 72 to 600, and it applies to PNG, WebP and JPEG. 144 ppi keeps the smallest print type around 12 device pixels.
- **WebP is lossless**, re-encoded from the Typst PNG. It is the usual bitmap to ship: same pixels as PNG, typically about a third the size. JPEG is for hosts that will not take WebP; it is lossy and often larger than PNG on these drawings.
- **Images are Typst, the same marks as the PDF.** There is no Chromium, Playwright, or HTML-screenshot path. A screenshot of the HTML page is not a Press image: it includes the Walk through control, which exists only on screen. If `typst` is missing, install it; do not fall back to a browser.

### Readability

A diagram that is too big to read in print gets a warning, and the build still succeeds. The warning names the line and says to split the diagram into several smaller ones linked from prose. The limits are 30 states, components or decision nodes, 10 sequence participants, 20 causal-loop variables, 40 timeline events, 15 entities, 40 tradeoffs cells, 30 call-stack frames, 128 bytes of memory layout, 16 modules in a dependency matrix and 15 classes.

A label word longer than 40 characters with no spaces is also a warning. Labels wrap at a fixed width, and a word longer than that width is broken into pieces on screen and on paper, so nothing leaves its card.

Small multiples (several frames) are allowed only when the author asks for them explicitly. This is not part of v0.1.

### Terminal

*New in v0.6.* `press preview doc.md` writes the document to the terminal, the way glamour renders Markdown. It is for reading where there is no browser, and for agents checking their own work. A terminal is a fixed number of columns wide and scrolls without end, so figures are laid out for that rather than shrunk from the screen.

- **Every figure fits the width.** Graph types run top to bottom unless that is wider than the terminal; a timeline runs down the page; a table shrinks its widest column first. A figure that still cannot fit, such as a sequence with many participants, prints as a numbered list of its edges. Nothing is cut off. A call stack too wide for its frames prints as an indented trace of its calls and returns, and a memory layout lists its pointers under its blocks.
- **Steps and references work as on paper.** Steps become numbered markers (①) on the figure with the captions as a legend below it, and prose references become letters ([a]) in both the prose and the figure.
- **Roles show without colour.** `focus` draws a double border, `muted` a dotted line. `happy` and `error` look like ordinary nodes. Green and red are for diffs.
- **Dark by default.** Terminals are usually dark, so colours are chosen for a dark background; `--theme light` is for light terminals. When the output is not a terminal, or `NO_COLOR` is set, it is plain text. `--ascii` draws with ASCII only.

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

Node kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. Each draws with its own shape or icon. A node without a kind draws as a plain component box. A vendor icon can take the place of the kind; see [Vendor icons](#vendor-icons).

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
- `<->` is an error. Branches are all the same solid edge; a rarer answer is still just an answer.
- `{role=focus}` marks the outcome to look at. `{role=happy}` and `{role=error}` are for the author, not a second colour. `steps` walk one path from the root.

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
cost -> fix : no

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
- *New in v0.4.* A cell's `note` is its caveat, printed small under the value: `mongo.tx : yes {note="multi-document since 4.0"}`. A neutral cell with a note is marked with a hollow ring: neither good nor bad, but read the small print. `{role=happy}` and `{role=error}` share the same ink fill; green and red are for diffs.
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

## Diagram types in v0.7

Three diagram types for software architecture. Each draws one concern. A system's context, its data flow and its deployment are three diagrams, not one fence with everything in it. All three use the shared grammar, roles, notes, groups, steps and prose references, and add only node kinds and, for `c4`, two attributes.

### `data-flow`

How data moves and changes: where it comes from, what transforms it, and where it rests. Edges are flows, and the label names the data that travels (`Cart`, `Charge request`), not the action. `-->` is a return or an asynchronous flow. `direction` defaults to `right`.

Node kinds:

| Kind | Draws as | Means |
|---|---|---|
| `external` | plain box | a person or system outside the diagram that sends or receives data |
| `process` | rounded pill | something that transforms or routes data |
| `store` | open-ended rectangle, lines on top and bottom only | data at rest: a database, a file, a queue |

A node without a kind draws as a plain box. A group is a trust or context boundary: what is inside it is under one owner or one level of trust, and a flow that crosses its edge is a flow across that boundary.

```data-flow id=checkout title="Checkout data"
customer: external "Customer"
psp: external "Payment processor"
group "Our systems" {
  validate: process "Validate cart"
  charge: process "Charge card"
  orders: store "Orders"
}

customer -> validate : Cart
validate -> charge : Payable order
charge -> psp : Charge request
psp --> charge : Result
charge -> orders : Paid order
```

### `c4`

The C4 model's first two levels: the system in its context, and the containers inside it. Edges are relationships, and the label is a short phrase a person would say (`Places orders`, `Reads and writes`). `direction` defaults to `down`, so people sit above the systems they use.

Node kinds: `person`, `system`, `container`. A person draws with a person icon.

Attributes:

- `{external=yes}` marks a system or person outside the one being described. It draws with a dashed outline and a tinted fill, so the system the reader owns stands out. `yes` is the only value; leave the attribute out for what you own.
- `{tech=Go}` names a container's technology. It prints in brackets, muted, under the name (`[Go]`), and a `note` on the same node follows it on the same line, after a `·`. Quote a value with spaces: `{tech="Next.js"}`.

A group is the boundary of the system being described. At the context level the system is one node; at the container level it is a group around its containers. Use `role=focus` on the system the diagram is about.

C4 defines the levels as separate diagrams. Press does not take a `level` header field in v0.7, since the shared header holds only `id`, `title` and `direction`. The level shows in the diagram's title and its kinds: a context fence has `system` nodes and no `container` nodes.

```c4 id=shop title="Online shop, containers"
customer: person "Customer"
group "Online shop" {
  web: container "Web app" {tech="Next.js"}
  api: container "API" {tech=Go}
  db: container "Database" {tech=Postgres}
}
mail: system "Email provider" {external=yes}

customer -> web : Uses
web -> api : JSON/HTTPS
api -> db : Reads and writes
api -> mail : Sends receipts
```

### `deployment`

Where software runs: regions, zones, clusters, nodes and the workloads on them. Edges are network paths, placement and replication; the label says which (`HTTPS`, `runs on`, `replicates`). `direction` defaults to `right`.

Node kinds:

| Kind | Draws as |
|---|---|
| `node` | a machine or VM, with a server icon |
| `workload` | a plain card: a service, a pod, a database process |
| `lb` | a load balancer icon |
| `cdn` | a globe icon |
| `volume` | a disk icon |

**Places are groups, and groups nest.** `group "us-east-1" { group "zone a" { ... } }` draws a region around its zones around its clusters. Nest as deep as the real topology goes; the places are labelled in their top-left corners, and each level is drawn inside the one above it. A node belongs to the innermost group it is written in.

**Counts are notes.** `{note="3 replicas"}` prints small under the name. There are no properties in this type. Use `role=muted` for placement edges (`runs on`) that the picture needs but the reader does not need to follow, and `role=error` or a step to show a failure domain.

```deployment id=prod title="Checkout in production"
lb: lb "Load balancer"
group "us-east-1" {
  group "Zone a" {
    api: workload "orders-api" {note="3 replicas"}
    pg: workload "Postgres primary"
  }
  group "Zone b" {
    pg_r: workload "Postgres replica"
  }
}

lb -> api : HTTPS
api -> pg : SQL
pg --> pg_r : replicates

## Diagram types in v0.9

Two types for how a program runs: the calls on its stack over time, and the bytes of its data. Both use the shared grammar and add no new line forms. Changes (`+` and `-`) are an error in both types in v0.9.

### `call-stack`

Frames on one thread's stack, over time. A frame is a node, and its label is the call as a reader would write it (`"factorial(3)"`). Edges are the events that change the stack: **`a -> b` means `a` calls `b`**, and **`b --> a : value` means `b` returns to `a`**, with what it returns as the label. Events happen in source order.

- **The first frame is the bottom of the stack**, and it is the only frame nothing calls.
- **Only the frame on top can call or return.** A call from any other frame is an error that names the frame on top and suggests the line it may have meant. A frame is called once; calling it again is an error that suggests a new id for the second call (`log_2: "log()"`).
- **A return to a frame below the caller unwinds the frames between.** They end at that moment without a value and draw cut off. Give the return `{role=error}` to show a thrown exception.
- **A frame that never returns stays open** to the right edge. That is how a fence shows the stack at one moment, such as the moment of a crash; mark the failing frame `{role=error}`.
- **Time is order, not duration.** Events are spaced only as far apart as the labels between them need. For real durations, use a `timeline`.
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
- **Misaligned fields are a warning.** A field of a known type whose offset is not a multiple of its size names the field, its offset, and the padding that would align it. `{packed=yes}` on a block (`order {packed=yes}`) turns the warning off.
- **Rows are eight bytes**, one 64-bit word, so alignment reads as columns. Offsets print under each row, at the start of each field. A field longer than two rows draws its first and last rows with a break between them. A field whose name does not fit its cells shows a number, and the name and type are listed under the block.
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

## Diagram types in v0.10

Two types for the shape of code, meant to be read together. **`dependency` is which modules may talk to which.** **`class` is how they talk:** the types one module publishes as its surface, the operations a caller invokes. Both use the shared grammar. A dependency matrix has no properties; a class diagram uses properties for fields and methods.

A class in that figure is not an inventory of every helper in the package. It is the interface of the module: what another module imports and calls. Private types stay out, or `{role=muted}`. Groups on the class diagram are the same modules as the rows of the matrix.

### `dependency`

Which modules use which. The author writes ordinary edges, **`a -> b` means `a` uses `b`** (an import, a call, a package dependency). The picture is a square grid, not a node-link graph: the same modules label the rows and the columns, in source order, and a mark in a cell means the row uses the column.

- **Read a row** to see what that module depends on. **Read a column** to see who depends on it.
- **A filled square is a use.** `-->` is a weaker use (a type-only import, an optional link) and draws as a hollow square. `<->` is mutual use and fills both cells.
- **The diagonal is empty.** A module using itself is an error.
- **Layered code fills one triangle.** With modules listed from most dependent to most stable, marks sit to the right of the diagonal. A cycle of two or more modules draws as a square around that block, and is a warning that names them.
- **A group is a layer or a package**, and draws as a band across those rows and columns.
- An edge label is kept for steps and does not appear in the cell. `{role=error}` marks a use that should not exist, `{role=happy}` an intended one, `{role=focus}` a module to look at (its row and column).
- `direction` has no meaning; the parser ignores it with a warning. Node kinds: none. Properties are an error.
- Steps and prose references name a module or an edge (`checkout -> billing`).

```dependency id=shop title="Who imports whom"
checkout -> catalog
checkout -> billing
billing -> payments
fulfillment -> catalog
fulfillment -> billing {role=error}

group "storefront" {
  checkout
  catalog
}
group "back office" {
  billing
  payments
  fulfillment
}

steps:
  fulfillment -> billing  "Fulfillment talks to billing directly; it should go through checkout."
```

### `class`

The types a caller uses to talk to a module: what they hold, the operations they expose, and how they relate. A node is a class, an interface or an abstract type. Its members are properties: `type.member : Type {attrs}`. `{op=yes}` marks a method, the usual way another module interacts; other properties are fields that belong on that surface. `direction` defaults to `down`.

Node kinds:

| Kind | Draws as | Means |
|---|---|---|
| `class` | a box with a name, then fields, then methods | a concrete type (the default) |
| `interface` | the same box, with «interface» above the name | a protocol, no instances |
| `abstract` | the same box, name in italics | a type that must be subclassed |

- **Draw the published surface, not the module's internals.** The types other modules import, the methods they call. A helper that never leaves the package is left out, or `{role=muted}`. `{role=focus}` on the type that *is* the module's interface (the one a neighbour imports).
- **Fields and methods draw in source order**, fields above a rule, methods below it. The value is the member's type (`Uuid`, `Money`). A method shows `name()` and then its type. `{op=yes}` is the only member attribute; write `{op=yes}` or leave it out.
- **Edges are relationships between types**, not between members. Join two types: `order -> user : places`. Member-to-member edges are an error.
- **`rel` is required to mean anything other than an association.** `{rel=extends}` is inheritance (hollow triangle at the parent). `{rel=implements}` is realizing an interface (dashed, same triangle). `{rel=contains}` is composition (filled diamond at the owner). `{rel=uses}` is a dependency, the same as `-->`. An unknown `rel` is an error that lists those four.
- **`->` with no `rel`** is an association; the label names it (`places`, `pays with`). **`-->`** is a dashed dependency. **`<->`** is a bidirectional association; it cannot take `rel`.
- **Groups are modules**, the same names as in a `dependency` figure of the same system. The matrix says who may import whom; this figure says what they import. Steps and prose references name a type, a member (`order.submit`) or an edge.

```class id=shop title="What checkout and billing publish"
user: "User"
user.email : String
user.place_order : Order {op=yes}

order: "Order" {role=focus}
order.id : Uuid
order.status : Status
order.total : Money {op=yes}
order.submit : void {op=yes}

item: "LineItem"
item.sku : String
item.qty : Int
item.price : Money

payment: interface "Payment" {role=focus}
payment.capture : void {op=yes}

card: "CardPayment"
card.last4 : String
card.capture : void {op=yes}

user -> order : places
order -> item {rel=contains}
order -> payment : pays with
card -> payment {rel=implements}

group "checkout" {
  user
  order
  item
}
group "billing" {
  payment
  card
}
```

## Node kinds

Each diagram type has a fixed list of node kinds, and each kind has a designed shape or icon. The list is closed so that every kind looks good. A kind the renderer doesn't know draws as a plain box, and the parser emits a warning naming the known kinds. To add a kind, add it to the spec.

`architecture` kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. `sequence` uses the same names (in v0.2, a subset: `user`, `service`, `database`, `queue`, `external`).

`data-flow` kinds: `external`, `process`, `store`. `c4` kinds: `person`, `system`, `container`. `deployment` kinds: `node`, `workload`, `lb`, `cdn`, `volume`; the icons for `node` and `volume` are the `service` and `storage` icons from `architecture`. `class` kinds: `class`, `interface`, `abstract`.

### Vendor icons

*New in v0.6.* In `architecture` and `sequence`, and in `deployment` from v0.7, a declaration can name a vendor's own icon where a kind would go. The name is the icon set, a dot, and the product:

```architecture title="Uploads on AWS"
fn: aws.lambda "Resize"
bucket: aws.s3 "Photos"
jobs: aws.sqs "Thumbnail jobs"
fn -> bucket : put
fn -> jobs
```

- **Icon sets.** `aws` (AWS Architecture Icons), `azure` (Azure Public Service Icons), `gcp` (Google Cloud core products and categories) and `k8s` (Kubernetes resources and infrastructure). `press icons` lists the sets; `press icons aws` lists every name in one, and `press icons aws dynamo` only the names containing a word.
- **Names** are the product's name in lower case with hyphens, without the vendor prefix: `aws.api-gateway`, `azure.cosmos-db`, `gcp.cloud-run`, `k8s.deployment`. AWS services known by their initials use them: `aws.s3`, `aws.sqs`, `aws.sns`, `aws.ses`, `aws.ecs`, `aws.eks`, `aws.ecr`, `aws.ebs`, `aws.elb`, `aws.iam`, `aws.kms`, `aws.vpc`, `aws.msk`.
- **They are drawn as the vendor publishes them**, in colour, beside the label, on screen and on paper. This is the one place Press shows colour it did not choose: a reader who works with a cloud recognises its icons faster than any label. Roles still apply to the box around the icon.
- **The label still matters.** Without one, the node shows its id. Name the instance (`"Photos"`), not the product; the icon already says the product.
- **An unknown icon** draws as a plain box, and the parser warns with the nearest name and the command that lists them. Icons are not available in other diagram types; there the parser warns and ignores the icon.
- **Licences.** The icons belong to their vendors and are not covered by Press's MIT licence. Each vendor allows them in architecture diagrams and documentation; see `assets/icons/NOTICE.md`. `scripts/import-icons.ts` rebuilds the sets from the vendors' packages.
