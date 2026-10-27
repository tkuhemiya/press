# Press language spec (draft, v0.2)

## Document

A Press document is CommonMark. A fenced code block whose language tag is a known diagram type is rendered as that diagram. All other fences are ordinary code blocks.

Fence header:

````
```<type> id=<name> title="<title>" direction=<right|down>
````

All header fields are optional. `id` is needed only when prose refers to the diagram.

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

- Nodes are created by first use. Declare one explicitly only to give it a kind or a label that differs from its id. The kind is optional: `id: "Label"`.
- A node belongs to the group it is declared in. A bare node line inside a group (`api` alone) moves an existing node into that group, so members can be listed after they are declared.
- A line may hold just a node and its attributes: `draft {role=focus}`.
- Ids are lowercase letters, digits, `_` and `-`. A `-` must sit between two other characters, so `a-->b` reads as an edge, never as an id. Labels are quoted strings.
- Values containing spaces are quoted: `{note="retried up to 3 times"}`.
- `note` is the one attribute besides `role` that every type accepts. In `state-machine` and `architecture` a node's note prints in small type under its label; it is for a short qualifier, not a sentence. Other types keep it in the source but do not draw it yet.
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

## Steps

A `steps:` section at the end of a fence walks the reader through the diagram in order. Each line references an existing edge or a single node and gives a caption. A node step highlights that node, for example to point at a state before any transition happens.

```
steps:
  draft                  "Every order starts as a draft"
  draft -> submitted     "The user submits the cart"
  submitted -> failed    "The card is declined"
  failed -> submitted    "They retry with a new card"
```

When more than one edge joins the same two nodes, as with repeated messages in a `sequence`, the step names the edge by its label: `api -> db : insert "caption"`. If the step is still ambiguous, the parser reports an error that lists the matching edges. `->` and `-->` are interchangeable in a step.

## Prose references

Prose links into a diagram with standard Markdown link syntax: `[text](#<diagram-id>.<node-id>)`.

```
When the card is declined, [the failed state](#order.failed) loops back.
```

## Rendering targets

### HTML

- `steps` become an interactive walkthrough: next/previous, with the current edge highlighted and the caption shown.
- Hovering a prose reference highlights the node.

### Print

Paper is a budget. A diagram should not take more space on paper than it does on screen, and print must never expand one diagram into a frame per step.

- **Steps compress into one frame.** Each step's edge gets a small numbered marker, and the captions become a compact numbered legend beside or under the diagram.
- **Prose references become markers.** A reference prints as the text plus a superscript marker that matches a marker on the node. Step markers are numbers (1, 2, 3); prose reference markers are letters (a, b, c), so the two never collide.
- **`muted` elements may shrink or drop** when the diagram would otherwise exceed its space.
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

Node kinds: `user`, `service`, `database`, `queue`, `external`, the same names as in `architecture`. `group "Name" { ... }` draws a labelled box around the participants it contains. `direction` has no meaning here; the parser ignores it with a warning.

```sequence
client -> api : POST /orders
api -> db : insert
db --> api : ok
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

- `{delay=yes}` on an edge marks a delay, drawn with the standard ‖ mark.
- `loop "Name": a -> b -> a` names a feedback loop. The chain must close (it ends where it starts) and each segment must be an edge in the diagram. **Press works out the loop's type from the edge polarities**: an even number of `-` makes it reinforcing (R), an odd number balancing (B). Loops are numbered in order (R1, R2, B1) and marked inside the diagram with their name.
- `direction` has no meaning here; the parser ignores it with a warning.

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

- The label is optional, as in any declaration: `14:02 deploy` is an event labelled `deploy`.
- Each event's card shows its time, written out for reading: `14:02`, `Mar 2019`, `14 Mar 2019`, `14 Mar 2019, 14:02`.
- Spacing follows real time. Calendar forms (the first three and date-and-time) may be mixed in one fence; clock times may not be mixed with calendar forms.
- Events are expected in chronological order. An event earlier than the one above it is a warning, since it is usually a typo.
- `{until=<when>}` makes an event a span that lasts until that time: a deploy freeze, an outage. `until` takes the same form as the event's own time and may not be earlier.
- A group becomes a span covering its members: an era, an impact window.
- Edges join events, for cause: `deploy -> alerts : caused`.
- **Undated timelines.** If no event has a `<when>`, events are ordinary node declarations (`id: "Label"`) and are spaced evenly in source order. A fence is either dated or undated; mixing the two is an error, and `until` needs a dated timeline.
- `direction=right` (the default) runs time left to right; `direction=down` runs it top to bottom, for many events or long labels.
- In a timeline, a line that starts with a `<when>` is an event, so ids cannot themselves be dates.

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

## Node kinds

Each diagram type has a fixed list of node kinds, and each kind has a designed shape or icon. The list is closed so that every kind looks good. A kind the renderer doesn't know draws as a plain box, and the parser emits a warning naming the known kinds. To add a kind, add it to the spec.

`architecture` kinds: `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`. `sequence` uses the same names (in v0.2, a subset: `user`, `service`, `database`, `queue`, `external`).
