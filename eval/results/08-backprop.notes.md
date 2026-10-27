# 08 backprop — notes

## Types used and why
- `architecture` (id=net, direction=right): used as a stand-in for a **computation graph**: input, weights, z1, h, ŷ, loss as nodes, with dependencies as edges. Steps walk the forward pass, then backward through the graph. It was the least-bad fit; none of the eight types is a dataflow/computation graph.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first try.
  (Nodes without a kind, `direction=right` in the fence header, and the same edge `z2 -> loss` used by two steps were all accepted.)

## Wanted but couldn't express
- **A computation-graph / dataflow diagram type** — the most important gap. Backprop is "values flow forward along edges, gradients flow backward along the same edges". Architecture edges mean standing connections between system components, and there are no kinds for operations (multiply, add, sigmoid) or values.
- **Annotating an edge in both directions with different things.** I wanted each edge to show the forward value on one side and the backward gradient (e.g. `∂L/∂h = (ŷ−t)·w2`) on the other, and steps that visibly reverse the flow. Steps can only highlight an existing forward edge; the backward direction is only in the caption text. Using `<->` would be wrong (not a two-way connection).
- **A step that focuses a single node.** The backward pass "starts at the loss with gradient 1"; I wanted a step that highlights just `loss`. I reused the edge `z2 -> loss` for two consecutive steps instead.
- **Math.** No inline maths typesetting is mentioned; I wrote formulas as Unicode in backtick code spans and in labels (`ŷ = w2·h + b2`). Labels became longer than "noun phrase" guidance suggests, because the formula *is* the content.
- **Showing stored activations** (the forward pass caches values used later) — would like a marker for "kept in memory"; prose only.

## Skill gaps
- SKILL.md doesn't say whether architecture nodes may omit a kind (it worked) or what they draw as.
- No guidance on what to do when no type fits; e.g. "prefer prose" vs "use architecture as a generic graph". I chose the latter; an explicit note would help.
- Unclear whether steps can reference a single node rather than an edge.
