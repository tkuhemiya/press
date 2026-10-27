# Press language spec (draft, v0.1)

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
- A line may hold just a node and its attributes: `draft {role=focus}`.
- Ids are `[a-z0-9_-]+`. Labels are quoted strings.
- Values containing spaces are quoted: `{note="retried up to 3 times"}`.
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

## Node kinds

Each diagram type has a fixed list of node kinds, and each kind has a designed shape or icon. The list is closed so that every kind looks good. A kind the renderer doesn't know draws as a plain box, and the parser emits a warning naming the known kinds. To add a kind, add it to the spec.

`architecture` kinds (v0.2): `client`, `service`, `database`, `queue`, `cache`, `storage`, `external`, `user`.
