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
5. Add `steps:` when order matters. Link a node from prose with `[text](#id.node)`, an edge with `[text](#id.from->to)`.
6. Run `press check doc.md`. Fix every error and every warning. Each message names the line and states a fix you can apply as written.
7. Build it and look: `press build doc.md --out-dir out`, then open the HTML, and `press build doc.md -o doc.pdf` for paper. The checker cannot see raw ids used as labels, text shrunk too small, or a figure that says something other than you meant. If you cannot open a browser, say so to the user rather than skipping this step silently.

## Choose a type

| The reader needs to see… | Use |
|---|---|
| States something moves between, and what moves it | `state-machine` |
| Who sends what to whom, in order | `sequence` |
| The parts of a system and how they connect | `architecture` |
| Who uses a system and which containers make it up | `c4` |
| Where software runs: regions, zones, nodes, replicas | `deployment` |
| How data moves between processes, stores and outside parties | `data-flow` |
| Events in time, gaps, overlapping spans | `timeline` |
| Why something grows, stalls, or oscillates | `causal-loop` |
| Questions that lead to an answer | `decision-tree` |
| Tables, fields and how they reference each other | `er` |
| Options compared on several criteria | `tradeoffs` |

If two types fit, pick the one whose edges mean what you want to say. A sequence edge is a message in time. An architecture edge is a standing connection. A state-machine edge is a transition. A data-flow edge is data that moves. A c4 edge is a relationship a person would say aloud. A deployment edge is a network path, a placement, or replication.

**One concern per diagram.** Software architecture has several views, and each is its own fence: `c4` for who uses what, `data-flow` for where data goes, `deployment` for where it runs, `architecture` for how the parts connect. Do not draw a context, a data flow and a deployment in one fence. Draw three, and let the prose say how they relate.

**No type fits.** Write that part as prose. Stretch a type only when its edges still mean the same thing. A commit history is a graph of commits, so `architecture` with `direction=right` draws it honestly. Stop when the picture needs something the type lacks. Press has no type yet for quantities on axes, such as supply and demand or temperature over time. It also has no type for bytes in memory, or claims and rebuttals.

## Principles

- **Meaning, not styling.** Never describe looks. `role` says what something is. `focus` means look here. `happy` means the intended path. `error` means failure. `muted` means context. Use one `focus` per diagram. Use `happy` and `error` only where they carry the point. A diagram where every node has a role says nothing.
- **Ids are short and lowercase.** `db`, `user_id`, and `payment_ok` are ids. Put the reader-facing text in a label, as in `db: database "Orders DB"`. Press draws an undeclared id as words, so `wage_demands` reads "wage demands". Declare a label when you need capitals, symbols, or different wording. Causal-loop variables and tradeoffs criteria take `id: "Label"` the same way.
- **Labels are short.** A node label is a noun phrase. An edge label is a few words. Put detail in prose or in a step caption. `note` is a short qualifier under a label.
- **Steps tell the story.** Use three to six steps. Each caption says why the move happens. Step through the path that matters. Leave the other edges out of `steps:`.
- **Prose and the diagram work together.** Point at a node from the text with `[the failed state](#order.failed)`. Point at an edge with `[the retry](#order.failed->submitted)`, and at a sequence phase or a causal loop by its id. On screen, the reader hovers the link and Press highlights what it names. On paper, the reference is a lettered marker.
- **`direction` is the only layout hint.** Leave it out unless you have a reason. Press picks the direction that fits the page. Put it in the fence header, as in `` ```architecture direction=down ``. Do not add extra nodes, or reorder lines, to push the layout around.
- **Page hints are rare.** On paper, Press already keeps a heading with the content under it, so hints are rarely needed. Add `{page=keep}` to a heading only when its section must be read on one page, such as a figure and the explanation that depends on it: `## Where the writes go {page=keep}`. Add `{page=new}` only to start a new major part of the document: `## Appendix: wire formats {page=new}`. Any other value is an error. The hint shows on paper only, so the heading reads the same on screen.

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

Participants appear in order of first use. `-->` is a reply. The kinds are `user`, `client`, `service`, `database`, `queue`, and `external`. A plain declaration draws a plain box. `group "Name" { ... }` boxes participants together.

`phase "Name" { ... }` brackets the messages inside it: a handshake, a round trip, the front channel, "async from here". Phases nest. Give a phase an id, as in `phase tls "TLS handshake" {`, to point at it from a step (`tls "Caption"`) or from prose (`#flow.tls`). A phase holds messages only. Declare participants and groups above the first phase.

```sequence id=flow
browser: client "Browser"
api: service "API"
db: database "Postgres"
phase tls "TLS handshake" {
  browser -> api : ClientHello
  api --> browser : ServerHello
}
browser -> api : POST /orders
api -> db : insert
db --> api : ok
api --> browser : 201 Created
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

### c4

Use it for the system in its context, then the containers inside it. Kinds are `person`, `system`, and `container`. Mark systems you do not own with `{external=yes}`. Name a container's technology with `{tech=Go}`; it prints in brackets under the name. A group is the boundary of the system you own, and the system you describe takes `role=focus`. An edge label is a short phrase a person would say: `Places orders`. Write the context and the container diagram as two fences. There is no `level` field.

```c4 title="Online shop, containers"
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

### data-flow

Kinds are `external`, `process`, and `store`. A store draws as an open rectangle, a process as a pill, and an external as a plain box. An edge label names the data (`Cart`, `Charge request`), not the action. A group is a trust boundary. Use it to show what crosses it. Keep deployment details, such as hosts and replicas, out of it.

```data-flow title="Checkout data"
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

### deployment

Kinds are `node`, `workload`, `lb`, `cdn`, and `volume`. Nest groups for the places: a region around its zones around its clusters. Put a count in a note: `{note="3 replicas"}`. Mark placement edges such as `runs on` with `role=muted`. Show one path or one failure domain in `steps:`. Leave what the software does to `c4` or `architecture`.

```deployment title="Checkout in production"
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
```

### timeline

Start an event line with its time. The forms are `2019`, `2019-03`, `2019-03-14`, `14:02`, `14:02:30`, and `2019-03-14T14:02`. For latencies and timeouts, use a time since the start: `0ms`, `+150ms`, `+2s`, `+5min`. Use one kind throughout, and keep the lines in order. `{until=…}` makes a span. A group becomes a shaded band across the time its members cover. Leave the times off when you want evenly spaced stages.

`lane "Name" { ... }` puts events on a parallel track: one per server, spacecraft, or git branch. Once there is a lane, every event goes in one. Edges may cross lanes, such as a vote request or a merge.

```timeline title="Election"
lane "Server B" {
  +150ms b_fires: "Becomes candidate"
  +180ms b_leads: "Leads term 5" {role=happy}
}
lane "Server C" {
  +165ms c_votes: "Votes for B"
}
b_fires -> c_votes : RequestVote
c_votes -> b_leads : granted
```

```timeline title="Outage"
14:02 deploy: "v2.3 rolls out"
14:09 alerts: "Errors spike" {role=error}
14:12 freeze: "Deploys frozen" {until=14:40, role=muted}
14:21 fixed: "Back to normal" {role=happy}
deploy -> alerts : caused
```

### causal-loop

Every edge label is a polarity. `+` means the same direction. `-` means the opposite direction. `{delay=yes}` marks a delayed link with ‖. Name each loop so the reader can see it. Give a loop an id, as in `loop wom "Word of mouth": …`, to point at it from a step or from prose. Press marks the loop R when it reinforces, and B when it balances. Declare a variable with a label, as in `rate: "Interest rate"`.

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

Each cell is `option.criterion : value`. Mark a cell with `happy` or `error`. Use `muted` when the cell is not relevant. When a value is neither good nor bad but has a catch, leave the role off and give it a note, as in `mongo.tx : yes {note="multi-document since 4.0"}`. The note prints under the value. Mark the recommended option with `{role=focus}`. Fill every cell. Name a criterion with a declaration, as in `revoke: "Revoke at once"`. To put criteria in a category, either list their ids in the group, or write their cells inside the group. Listing ids looks like `group "Security" {`, then `revoke`, then `}`.

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
| Timeline groups used as parallel lanes | `lane "Name" { ... }`. A group is a window across time |
| A neutral cell marked `error` because it has a catch | No role, and `{note="the catch"}` |
| A causal edge labelled `increases` | `: +` |
| One diagram explaining two ideas | Two diagrams, each with its own prose |
| A c4 context, a data flow and a deployment in one fence | Three fences: `c4`, `data-flow`, `deployment` |
| `level=container` on a c4 header | Leave it out. Say the level in the title |
| An external c4 system drawn with `kind` or a colour | `{external=yes}` |
