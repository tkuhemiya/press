# Overlay vs side-by-side diffs

Press already has a diff *source*: `+` / `-` lines in one fence. The question is the *view*. Today that view is one figure with both sides drawn at once, added green, removed red, changed amber. This experiment takes the existing fences in `docs/examples/diffs.md` and draws each of them four ways.

Rebuild:

```
node --experimental-strip-types scripts/experiment-diff-layout.ts
```

That writes `docs/experiments/diff-layout/gallery.html` and PNGs under `shots/`.

## What “today” actually draws

It is not a comparison of two diagrams. It is a union:

- Every node and edge that exists on either side is laid out once.
- Presence is encoded with colour and a `+` / `−` / `~` prefix.
- A renamed thing shows the *after* label plus `was "…"`.
- Role colour (`happy` green, `error` red) is the same ink as change colour.

So the reader is asked to subtract. They never see a machine that could run, a sequence that could happen, or a loop whose polarities agree.

## The four views

1. **Overlay** — current Press.
2. **Independent split** — drop `+` lines for before, drop `-` lines for after, unmark the rest, lay each side out on its own.
3. **Aligned split** — the overlay SVG twice; hide `added` on the left, `removed` on the right. Positions match; holes remain.
4. **Ghost** — same as aligned, other side at 20% opacity.

## What the pictures show

### State machine — overlay is a superposition

The fraud-check change is a new `review` state and a retry that goes back to `draft`. Overlay puts `− payment ok` and `+ needs review` on the same canvas, so submitted has five ways out. Independent split is two legal lifecycles. Aligned split keeps `paid` / `failed` in the same seats, with a hole on the left where `review` will sit.

Independent is the first time the *shape* of the change is obvious. Aligned is the first time you can point at the hole.

![Overlay](examples/state-overlay.png)

![Independent before / after](examples/state-independent.png)

![Aligned, same layout](examples/state-aligned.png)

### Sequence — overlay is the worst case

Checkout overlay keeps the legacy store, the cache, the refund path and the confirm path in one swimlane chart. It is a sequence that never ran. Independent split is two ordinary sequences, and they still line up because participants are columns. Aligned split is even better: the lifelines stay put, so “write order” moving from legacy to `Orders DB` is a horizontal glance.

This is the type that most wants a two-panel view.

![Sequence overlay](examples/sequence-overlay.png)

![Sequence independent](examples/sequence-independent.png)

![Sequence aligned](examples/sequence-aligned.png)

### Architecture — independent layout lies

The queue change, laid out independently, flips direction: before goes left-to-right, after top-to-bottom, because Press picks a direction per figure. Comparison dies. Overlay and aligned keep one skeleton. Aligned is the useful extreme here, not two fresh layouts.

![Architecture overlay](examples/arch-overlay.png)

![Architecture independent — direction flipped](examples/arch-independent.png)

![Architecture aligned](examples/arch-aligned.png)

### Causal loop — polarity cannot share an edge

Saturation flips from `−` to `+`. Overlay draws both strokes on the same pair of nodes. Independent split is the only view where the balancing loop and the later reinforcing loop are each a real loop. Aligned keeps the nodes still, which helps, but a `changed` node still shows the after label on both panels (`Saturated market` / `was "Market saturation"`). CSS cannot recover the before name.

![Causal loop overlay](examples/loop-overlay.png)

![Causal loop independent](examples/loop-independent.png)

### ER and tradeoffs — overlay is already a decent unified diff

Schema and matrix diffs are row edits. Overlay reads like a table diff: `− sku`, `+ price`, `~ placed_at`. Independent split works, but you hunt for the row that moved. Keep overlay for these.

![ER overlay](examples/er-overlay.png)

![ER independent](examples/er-independent.png)

![Tradeoffs overlay](examples/tradeoffs-overlay.png)

![Tradeoffs independent](examples/tradeoffs-independent.png)

### Timeline — overlay mixes two histories

The incident overlay has both “deploys frozen” and “roll back to v2.2”, plus a `was 14:10` note on a 14:16 event. Independent split is two timelines on the same axis, which is the comparison. Aligned is less helpful because hidden events still occupy time.

### Decision tree — both views work

Overlay makes the new `freshness` question obvious as a green insert. Independent split makes each policy a tree you could follow. Prefer overlay when the insert is small; split when the branching actually changes.

## Ghost is not a direction

Fading the other side gives you two overlays. It costs the space of a split and keeps the superposition. Drop it.

## Constraints that still hold

- **Paper is a budget.** Two panels double the figure. Print should stay a single overlay, or two small figures only when they still fit.
- **One fence.** The `+` / `-` grammar is right. The author should not write two fences. Split is a render of one fence.
- **Changed labels.** Pairing `- paid: "Paid"` with `+ paid: "Paid in full"` only has one box in the overlay model. A true before panel has to rebuild that node, not hide CSS.
- **Role vs change.** `happy` and `added` share green; `error` and `removed` share red. On an overlay the reader cannot tell a success path from a new path unless they read the `+` prefix. Split panels get role colour back, because each side is a normal diagram.

The skill text that says “never draw a before figure and an after figure” is about *authorship*. It should not forbid a renderer from *projecting* the two sides.

## Recommendation

Do not switch every diff to independent side-by-side. That extreme helps sequences and state machines and breaks architecture (direction), causal loops (layout jitter), and print.

Do not keep overlay as the only view either. For anything that adds or removes structure, painting the union is the confusion.

Best direction:

1. **Keep one fence and the overlay model** as the source of truth and as the print form.
2. **On screen, for structural diffs, project an aligned before / after pair** that shares layout. Each panel is a real diagram: roles, no change paint, the other side absent (holes are fine). Treat this as the default for `sequence`, `state-machine`, `architecture`, `data-flow`, `c4`, `deployment`, `causal-loop`, `decision-tree`, `timeline`.
3. **Keep overlay (unified) for in-place edits:** `er`, `tradeoffs`, and a rename-only graph.
4. **A cheaper overlay fix, worth doing even if split waits:** on a diff figure, mute unchanged parts and never use role colour for change. Green/red would then mean change only. That makes today’s union read as a unified diff instead of a highlighter accident.
5. **Do not independently re-lay-out the two sides** unless layout is locked (same direction, same ranks). Independent is a debug view, not the product.

The interesting implementation is not “two figures”. It is: lay out the union once, then draw it twice with a side filter — and rebuild paired labels so the before panel can say “Paid” while the after panel says “Paid in full”.
