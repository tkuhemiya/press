# The Press language

Press is Markdown with diagram fences. The fence's language tag is the diagram type. Everything outside a fence is ordinary Markdown. This file is the whole language, with what each type is for. `SKILL.md` is how to choose and write well.

## Pick a type

Pick the type whose edges mean what you want to say. The edge is the claim.

| The reader needs to see… | Use | An edge means |
|---|---|---|
| States something moves between, and what moves it | `state-machine` | a transition |
| Who sends what to whom, in order | `sequence` | a message, in time |
| The parts of a system and how they connect | `architecture` | a standing connection, labelled with what travels |
| Who uses a system, and which containers make it up | `c4` | a relationship a person would say aloud |
| Where software runs: regions, zones, nodes, replicas | `deployment` | a network path, a placement, or replication |
| How data moves between processes, stores and outside parties | `data-flow` | data that moves, labelled with the data |
| Events in time, gaps, overlapping spans, parallel tracks | `timeline` | a cause, a message, or a merge |
| Why something grows, stalls, or oscillates | `causal-loop` | an influence, `+` or `-` |
| Questions that lead to an answer | `decision-tree` | an answer |
| Tables, fields and how they reference each other | `er` | a reference, with cardinality |
| Options compared on several criteria | `tradeoffs` | none; it is a table of judged cells |
| Which calls are waiting on which, and what each returns | `call-stack` | a call (`->`) or a return (`-->`), in order |
| The bytes of a struct: fields, offsets, padding, pointers | `memory-layout` | a pointer, from a field to what it points at |
| Which modules import which | `dependency` | a use: the row imports the column |
| The types a caller uses to talk to a module | `class` | an association, or `{rel=extends\|implements\|contains\|uses}` |

**Where each one hides in code.** Press never reads code; you do. These are the shapes to look for.

| You find… | Draw a |
|---|---|
| A `status`, `state` or `phase` field; an enum of stages and a `switch` over it; two booleans that must agree; `canX()` guards | `state-machine` |
| A handler that awaits several calls in order; a protocol; a client and server that retry, ack or time out | `sequence` |
| Clients built at startup, service URLs in config, `docker-compose`, queue and cache clients, module imports across packages | `architecture` |
| The README's one-line pitch, its users, the third parties it calls | `c4` |
| Terraform, Helm, Kubernetes manifests, replica counts, regions, health checks | `deployment` |
| A pipeline that parses, validates, enriches and stores; personal or payment data crossing a boundary | `data-flow` |
| Migrations, ORM models, `schema.prisma`, `CREATE TABLE`, foreign keys | `er` |
| Nested `if`s over config, flags or request shape that pick a path | `decision-tree` |
| Retries, backoff, autoscaling, caches that warm, queues that grow; "it gets worse under load" | `causal-loop` |
| Timeouts, TTLs, leases, an incident log, a release history, branches | `timeline` |
| A design doc, an ADR or a PR description weighing options | `tradeoffs` |
| Recursion, a stack trace, an exception that skips frames, middleware that wraps a handler | `call-stack` |
| A `struct` or `#[repr(C)]` type, a wire format, a linked list or tree of nodes, a cache line | `memory-layout` |
| Package imports, `go.mod`, `package.json` workspace deps, who may talk to whom in the codebase | `dependency` |
| A public class, interface or trait other packages import; the methods they call | `class` |

**One concern per fence.** A context, a data flow and a deployment are three fences, not one. Let the prose say how they relate.

**No type fits.** Write that part as prose. Stretch a type only when its edges still mean the same thing: a commit history is a graph of commits, so `architecture` with `direction=right` draws it honestly. Press has no type for quantities on axes (latency against load), or claims and rebuttals. Do not fake them.

## The shared grammar

```text
a -> b : label               edge. --> is dashed: a reply, async, or weak. <-> goes both ways.
a -> b -> c                  chain. One edge per segment. No label on a chain.
id: kind "Label" {attrs}     declaration. kind and label are optional.
id {note="short qualifier"}  a note prints small, under the label
group "Name" { ... }         grouping: a boundary, a place, a category
node.key : value {attrs}     property, in er, tradeoffs, memory-layout and class only
# comment
steps:                       last section. One step per line.
  a -> b "Caption"           a step on an edge
  a "Caption"                a step on a node, a property (x.y), a phase or a loop
```

The fence header holds `id=`, `title="…"`, and `direction=right` or `direction=down`. All are optional. Set `id` when prose or another figure refers to the diagram.

- **Ids** are lowercase letters, digits, `_` and `-`: `db`, `user_id`, `payment_ok`. An undeclared id draws as words, so `wage_demands` reads "wage demands". Declare a label for capitals, symbols or different wording: `db: database "Orders DB"`.
- **Nodes** exist by first use. Declare one only to give it a kind, a label or a note. A bare id inside a group moves an existing node into it.
- **Attributes** are `{key=value, key="with spaces"}`. Attributes at the end of a chain apply to every segment, so `start -> draft -> paid {role=happy}` marks a whole path.
- **Two edges between the same pair** are told apart by label: a step names one as `api -> db : insert "Caption"`. A request `->` and its reply `-->` are the same pair.
- **Steps** come last. Three to six of them, along the path that matters.

### Roles

`role` says what something is. Press decides how it looks.

| Role | Means |
|---|---|
| `focus` | Look here. One per diagram. |
| `happy` | The intended or success path |
| `error` | A failure path or a bad state |
| `muted` | Context the reader can skip |

There are no colours, sizes or styles. A diagram where every node has a role says nothing.

### Prose references

Link prose into a figure, and hovering highlights what the link names. On paper it prints as a lettered marker.

```text
[the failed state](#order.failed)            a node
[the retry](#order.failed->submitted)        an edge
[the handshake](#flow.tls)                   a sequence phase or a causal loop, by id
[the foreign key](#shop.orders.user_id)      a property
```

### Changes

Mark lines as in a diff. `+ ` is a line that exists after the change. `- ` is a line that existed before. Unmarked lines exist on both sides.

```state-machine id=checkout-change title="Checkout, with a fraud review"
start -> cart
cart -> submitted : pay
- submitted -> paid : approved
+ submitted -> review : flagged
+ review -> paid : cleared
paid -> end
```

- **Mark every line that mentions a new node.** An unmarked line means the node was already there.
- **Rename** with a `-` and a `+` declaration of the same id. Press shows the new label with the old one as a note. The same works for a property's value.
- **Groups, phases and lanes** cannot be marked. Mark their members; the container follows them.
- On screen, structural diffs draw as aligned Before and After panels from one layout: removed red on the left, added green on the right. Print and in-place types (`er`, `tradeoffs`) stay one overlay: added green, removed red and dashed, changed amber. Overlay labels also start with `+`, `−` or `~`. Green and red are for diffs; `{role=happy}` is a check and a heavy line, `{role=error}` a hatch.
- Steps and prose links may point at removed elements. When a removed edge and an added edge join the same pair, a prose link to that edge is ambiguous; point at a node instead.
- Write one fence. Press projects the two sides. Never author a before figure and an after figure.

### Size

`press check` warns when a figure is too big to read in print: 30 states or components, 10 sequence participants, 20 causal-loop variables, 40 timeline events, 15 entities, 40 tradeoffs cells, 30 call-stack frames, 128 bytes of memory layout, 16 modules in a dependency matrix, 15 classes. Those are ceilings, not targets. A label word over 40 characters with no spaces also warns.

### Page hints

On paper Press keeps a heading with what follows it. Add `{page=keep}` to a heading only when its section must be read on one page, and `{page=new}` only to start a major part: `## Appendix: wire formats {page=new}`. Hints affect print only.

## Each type

### state-machine

Use it when the thing has a lifecycle and the reader must know which moves are legal. `start` and `end` are pseudo-states. Mark the success path `happy` and failures `error`. Label each state with what is true in it ("Lease held, write pending"), not the enum constant.

```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry
paid -> end
```

### sequence

Use it when order is the point: a request's life, a protocol, a race. Participants appear left to right in order of first use. `-->` is a reply or async message. Kinds are `user`, `client`, `service`, `database`, `queue` and `external`. `group "Name" { ... }` boxes participants together.

`phase "Name" { ... }` brackets the messages inside it: a handshake, a retry loop, "async from here". Phases nest. Give one an id (`phase tls "TLS handshake" {`) to point at it from a step or prose. A phase holds messages only, so declare participants and groups above the first phase.

```sequence id=flow title="Placing an order"
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

Use it for the parts and the standing connections between them. Kinds are `client`, `service`, `database`, `queue`, `cache`, `storage`, `external` and `user`. A group is a boundary: a network, a trust zone, a package. An edge label says what travels.

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

For a system on a cloud, name the vendor's icon where the kind goes: `fn: aws.lambda "Resize"`, `db: azure.cosmos-db "Orders"`, `run: gcp.cloud-run "API"`, `pod: k8s.pod "web"`. This works in `architecture`, `sequence` and `deployment`. Run `press icons aws lambda` to find a name rather than guessing. Label the node with what this instance does; the icon already names the product. Use plain kinds when the vendor is not the point.

For a codebase's modules, use `dependency`: who may import whom, as a grid. Use `class` for the types a neighbour actually calls; group those types by module. `architecture` is the running parts.

### c4

Use it for the system in its context, then the containers inside it, as two fences. Kinds are `person`, `system` and `container`. Mark what you do not own `{external=yes}`. Name a container's technology with `{tech=Go}`. A group is the boundary of the system you own, and the system the figure is about takes `role=focus`. Say the level in the title; there is no `level` field.

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

Use it when what matters is where data goes and what crosses a boundary: personal data, payments, an import pipeline. Kinds are `external`, `process` and `store`. An edge label names the data (`Cart`, `Charge request`), not the action. A group is a trust boundary. Keep hosts and replicas out.

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

Use it for where things run and what fails together. Kinds are `node`, `workload`, `lb`, `cdn` and `volume`. Nest groups for places: a region around its zones around its clusters. Put a count in a note. Mark placement edges such as `runs on` with `role=muted`. Show one failure domain in `steps:`.

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

Use it when time between things is the point: an incident, a timeout racing a retry, a release history. Start an event line with its time: `2019`, `2019-03`, `2019-03-14`, `14:02`, `14:02:30`, `2019-03-14T14:02`, or a time since the start (`0ms`, `+150ms`, `+2s`, `+5min`). Use one kind throughout and keep lines in order. `{until=…}` makes a span. A group is a shaded window across time. Leave times off for evenly spaced stages. Use real times only; never invent a latency.

`lane "Name" { ... }` is a parallel track: one per server, process or branch. Once there is a lane, every event goes in one. Edges may cross lanes.

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

Use it for feedback: retry storms, cache stampedes, autoscaling that overshoots, a queue that grows faster under load. Every edge label is `+` (same direction) or `-` (opposite). `{delay=yes}` marks a delay. Name each loop with `loop "Name": a -> b -> a`; Press marks it R (reinforcing) or B (balancing). Give a loop an id (`loop storm "Retry storm": …`) to point at it. Declare a variable's label as `rate: "Request rate"`.

```causal-loop title="Word of mouth"
customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : -
loop "Word of mouth": customers -> referrals -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

### decision-tree

Use it when the code or the advice picks one path from a few questions. Edges are answers. Label every edge from a question with more than one answer. A node with no answers out is an outcome. One root. Branches may rejoin but never loop back; a loop is a state machine.

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

Use it for the tables and the references between them. Fields are properties, `entity.field : type`. A reference goes from the referring field to the referred field, and every edge states `card`, read from the first entity to the second. Each end is `1`, `0..1`, `N` (zero or more) or `1..N`. Field attributes are `{key=yes}`, `{unique=yes}` and `{null=yes}`. Draw the tables the point needs, not the whole schema.

```er title="Orders"
users.id : uuid {key=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid {null=yes}
orders.user_id -> users.id : placed by {card=N:0..1}

steps:
  orders.user_id -> users.id "An order may have no user yet, as for a guest checkout."
```

### tradeoffs

Use it for a choice between options, such as the alternatives a PR rejected. Each cell is `option.criterion : value`. Mark a cell `happy` or `error`, or `muted` when it does not matter. A value with a catch takes no role and a note: `mongo.tx : yes {note="multi-document since 4.0"}`. Mark the chosen option `{role=focus}`. Fill every cell. Name a criterion with a declaration, `revoke: "Revoke at once"`. Put criteria in a category by listing their ids in a group, or by writing their cells inside it.

```tradeoffs title="Session storage"
postgres: "Postgres" {role=focus}
cookie: "Signed cookie"
postgres.cost : "already running" {role=happy}
postgres.revoke : instant {role=happy}
cookie.cost : none {role=happy}
cookie.revoke : "at expiry" {role=error}
```

### call-stack

Use it for what is waiting on what: recursion, a trace, an exception that unwinds. A frame is a node; label it with the call as a reader would write it, `f3: "factorial(3)"`, and put the locals that matter in a note. `a -> b` is `a` calling `b`; `b --> a : value` is `b` returning, labelled with what it returns. Lines run in time order, and only the frame on top may call or return. A return to a frame further down unwinds the frames between; mark it `{role=error}` to show a throw. A frame that never returns stays open, which is how to draw the stack at the moment of a crash. Call a function twice with two ids (`log`, `log_2`). One fence is one thread; for concurrency use a `sequence`.

```call-stack title="factorial(3)"
f3: "factorial(3)"
f2: "factorial(2)"
main -> f3
f3 -> f2
f2 --> f3 : 2
f3 --> main : 6

steps:
  f2 --> f3 "The answer only appears on the way back."
```

### memory-layout

Use it for the bytes of a value. A node is a block (a struct, a frame, an allocation); its fields are properties in memory order, `block.field : type`. Sizes come from `bool`, `u8` to `u64`, `i8` to `i64`, `f32`, `f64`, `usize`, `ptr`, `Node*` and arrays such as `"u8[24]"`; anything else needs `{size=N}`. Press does not insert padding: write it, `order.pad : padding {size=7}`, and Press warns when a field is misaligned. A pointer is an edge from a field to a block or field, `a.next -> b`; a null pointer is a field with `{note=null}`. Groups are regions, such as `Stack` and `Heap`.

```memory-layout title="struct Order, 16 bytes"
order.id : u64
order.total : u32
order.paid : bool
order.pad : padding {size=3}

steps:
  order.pad "The struct rounds up to a multiple of 8."
```

### dependency

Use it when the claim is who is allowed to import whom, not how a request flows. An edge `a -> b` means a uses b. Press draws a square grid: the same modules on both axes, a filled cell when the row uses the column. `-->` is a weaker use and draws hollow. A cycle of modules is a warning and a square on the grid. Groups are layers. Do not use this for running services; that is `architecture`.

```dependency title="Who imports whom"
checkout -> catalog
checkout -> billing
billing -> payments
fulfillment -> catalog
fulfillment -> billing {role=error}
```

### class

Use it for the types a caller uses to talk to a module, not every helper in the package. A class is the module's interface: what a neighbour imports and the methods it calls (`{op=yes}`). `{role=focus}` the type that *is* that surface. Groups are the same modules as a `dependency` figure. `{rel=extends}` is inheritance, `{rel=implements}` an interface, `{rel=contains}` composition, `{rel=uses}` (or `-->`) a dependency. A plain `->` is an association. Kinds: `class` (default), `interface`, `abstract`. Tables and foreign keys are `er`; bytes of one struct are `memory-layout`.

```class title="What checkout and billing publish"
order: "Order" {role=focus}
order.id : Uuid
order.submit : void {op=yes}
item: "LineItem"
payment: interface "Payment" {role=focus}
payment.capture : void {op=yes}
card: "CardPayment"
order -> item {rel=contains}
card -> payment {rel=implements}
group "checkout" {
  order
  item
}
group "billing" {
  payment
  card
}
```

## Common mistakes

| Mistake | Instead |
|---|---|
| `{color=red}`, `{style=bold}` | `{role=error}`, `{role=focus}` |
| A label on a chain: `a -> b -> c : go` | Give the labelled edge its own line |
| Uppercase or spaced ids: `Order DB` | `orders_db: "Order DB"` |
| Code names as labels: `PENDING_REVIEW`, `handleCb()` | What the reader sees: "Waiting for review", "Card result" |
| A step for every edge | Three to six steps along the path that matters |
| A caption that reads out the edge: "API calls DB" | Why it happens: "Only a paid order is written" |
| An er edge without `card` | `{card=N:1}` |
| A causal edge drawn through an extra node to mean "slowly" | `{delay=yes}` |
| A causal edge labelled `increases` | `: +` |
| Timeline groups used as parallel tracks | `lane "Name" { ... }`. A group is a window across time |
| A neutral cell marked `error` because it has a catch | No role, and `{note="the catch"}` |
| One diagram explaining two ideas | Two diagrams, each with its own prose |
| A c4 context, a data flow and a deployment in one fence | Three fences: `c4`, `data-flow`, `deployment` |
| `level=container` on a c4 header | Leave it out. Say the level in the title |
| A change shown as two diagrams, before and after | One fence with `+` and `-` lines |
| `+ group "New" {` | Mark the members; the group follows them |
| A new node marked `+` on one line and unmarked on another | Mark every line that mentions it |
| A second call to the same function reusing its id | A new id per call: `log_2: "log()"` |
| A call stack drawn as a `sequence` of one participant | `call-stack`, with calls and returns |
| A struct's fields packed with no padding | Write the padding: `order.pad : padding {size=7}` |
| An import graph drawn as `architecture` | `dependency`, so cycles and layers read as a grid |
| A class diagram drawn as `er` | `class`. `er` is tables and `card`; `class` is types and `rel` |
| Every helper class in a module | The types other modules import. Helpers stay in prose, or `{role=muted}` |
