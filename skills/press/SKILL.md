---
name: press
description: Use when someone wants to understand a codebase, a subsystem, a piece of code, or a change (a PR, branch, diff or commit) and diagrams would help; when the user asks for Press, a Press document or a Press fence; when writing any explanation of a system, process, decision or comparison where a figure should carry part of it; and when fixing Press source from the messages `press check` prints.
---

# Explain with Press

Press is Markdown with diagram fences. You write what exists, how it connects, and what matters. Press does the layout, the typography and the colour, on screen, on paper and in the terminal.

The reader can read prose much more slowly than you can write it. A good figure lets them check a claim at a glance: "these are the only ways an order fails", "this PR adds one hop to every checkout". Your job is to find the few claims that matter, draw each one so it can be checked, and say the rest in plain prose.

The language, and what each diagram type is for, is in [`references/language.md`](references/language.md). Read it before you write the first fence.

## 1. Understand before you draw

Press never reads code. You do, and every node and edge you draw is a claim about the code. Draw only what you traced.

- **Start from the edges of the system.** The README, the entry points (`main`, routes, handlers, CLI commands), the config that wires things together, the schema or migrations, the infra files. Then follow one real request or one real job end to end. Tests show the intended behaviour and the edge cases.
- **Read for the shapes a figure needs**, not for everything. The parts and what travels between them. The states something moves through and what moves it. The order of one request. The data at rest. Where it runs. The table "Where each one hides in code" in `references/language.md` maps what you see to a diagram type.
- **Note what surprised you.** The non-obvious part is usually the most valuable figure: the retry that loops, the state that can't be left, the write that happens before the check.
- **Note what you could not trace.** Say so in the prose. Never fill a gap with a plausible box.
- **Keep three kinds of claim apart.** What the code shows (cite it: `src/orders/submit.ts:42`). What you infer from it (say "appears to"). What you could not find. A figure states only the first kind; the prose may state the others, marked as such.
- **Never invent a number.** A latency, a replica count or a timeout appears only if it is in the code, the config or a measurement you have.

**A big repo or PR.** If you can start subagents, split the question into two to four angles (the request path, the data model, the background jobs, the deploy), and give each one [`references/explorer-prompt.md`](references/explorer-prompt.md) with its angle filled in. Start them together, then write the document yourself from what they return, checking anything they disagree on. For one module or a small PR, read it yourself. When in doubt, read it yourself.

## 2. Find the story before the figures

Before you write a fence, write two things for yourself:

1. **The one sentence the reader should leave with.** "Orders are only written after the charge succeeds, so a failed payment leaves nothing to clean up."
2. **One line per figure**, each a claim. Drop any figure that does not change what the reader knows.

Then:

- **Start small and build up.** Open with the smallest picture that is true: five to seven nodes. Each later figure zooms into one part or adds one thing. A reader who watches a system assemble understands it; a reader handed one figure with everything in it skims. A single all-at-once diagram saved for the end is a reference, not an explanation.
- **Keep the cast stable.** The same thing has the same id, label and kind in every figure, so the reader recognises it. Give each concept one name and keep it, in prose too.
- **Use steps for order inside a figure.** If the point is a path through the figure, walk it in `steps:` rather than drawing three figures. Paper shows the steps as numbered markers on one frame.
- **Skip the figure when prose is enough.** One simple fact needs a sentence, not boxes. Never draw a list: boxes with nothing connecting them, or a status list.

## 3. Explaining a system

For a repo, a subsystem or a piece of code. Adapt the shape; drop any part with nothing to say.

- **Overview.** One or two paragraphs: what it is, what it does, why it exists. A reader should be able to stop here and know whether to keep going.
- **The map.** One small figure of the parts: `c4` for who uses it and what it is made of, `architecture` for how the parts connect, or `architecture` over modules for a library. Five to nine nodes. The rest of the document zooms into it.
- **How it works.** The longest part. Follow one real path: what triggers it, what happens in order, where data goes, where the decisions are. Usually a `sequence` with steps. Then the hard part, in whichever type fits: a `state-machine` for a lifecycle, a `causal-loop` for behaviour under load, a `decision-tree` for branching logic, an `er` for the data.
- **Where things live.** A short list of the files a newcomer would open first. Prose, not a figure.
- **Gotchas.** What looks like it works one way and works another. Skip it if there is nothing.

Name real things in the prose: "`OrderService.submit` calls `Payments.charge` before it opens the transaction", not "the service delegates to the payment layer". Explain why the complex part is complex. Do not pad the simple parts.

## 4. Explaining a change

For a PR, a branch, a commit or a diff. The reader is a reviewer, or someone catching up, who wants to know what the change does to the system. They can read the diff; they cannot see its shape.

**Get the change and its reason.**

```sh
gh pr view 123 --json title,body,files,commits,closingIssuesReferences
gh pr diff 123                        # or: git diff main...HEAD
git log --oneline main..HEAD
```

The PR body, the linked issue and the commit messages say why. The diff says what. Neither says what it does to the running system. For that, read around the diff: the callers of what changed, the code before the change, and what reads the same data elsewhere. A diff shows lines; you are drawing behaviour.

**Find what changed for the system.** Usually it is one or two of these:

| The change… | Draw it as a diff in a |
|---|---|
| adds or removes a state, or changes what moves between states | `state-machine` |
| adds a hop, reorders calls, adds a retry, a cache check or a timeout | `sequence` |
| adds, removes or rewires a service, queue, cache or module | `architecture` or `c4` |
| changes where personal or payment data goes | `data-flow` |
| changes tables, columns, keys or references | `er` |
| changes replicas, zones, or where something runs | `deployment` |
| changes which path a flag, a config value or a request takes | `decision-tree` |
| changes behaviour under load: retries, backoff, limits | `causal-loop` |
| was chosen over alternatives the reviewer will ask about | `tradeoffs` |

A change of thirty files may move one edge. A one-line change may add a state. Draw the effect, not the file list. A pure refactor with no change in behaviour can be an `architecture` diff of modules, or a sentence saying nothing a user sees changes.

Look past the diff for what it changes that the diff does not spell out: a column another service reads, a message format a consumer parses, a flag default, a cache key. Those belong in the figure or in the risk section.

**Draw one fence with `+` and `-` lines.** Show the change in its context, like a diff's context lines: keep the unchanged parts the change touches, one hop out, and leave the rest of the system out. Walk the new path in `steps:`. A step on a removed edge says what used to happen. Never draw a before figure and an after figure.

**Shape the document.** The title says what changes in behaviour, in plain words: "Checkout: payments move onto a queue", not "PR #123" or "Refactor payment module".

- **Why.** The problem and the approach, in one to three sentences.
- **The change.** One figure per concern, each with a sentence before it that states the claim and a sentence after it that points at the one detail worth checking.
- **What it touches.** Who or what else is affected, and why that is safe or risky. Name the one fact the change is safe because of, if there is one, and where you checked it.
- **What it leaves out.** Deliberate gaps and follow-ups.
- **What to check in review.** The two or three places a reviewer should look hardest, with `file:line`.

Before you finish, walk the diff hunk by hunk. Every hunk that changes behaviour is in a figure, in the prose, or named as left out.

A short example of the shape, as source:

````markdown
# Checkout: a fraud review before payment

Orders over the risk threshold now wait for a fraud review before they are charged. Before
this change, every submitted order was charged at once (#412).

```state-machine id=order title="Order lifecycle, with a fraud review"
start -> draft
draft -> submitted : submit
- submitted -> paid : payment ok {role=happy}
+ submitted -> review : over risk threshold {role=focus}
+ submitted -> paid : under threshold {role=happy}
+ review -> paid : approved {role=happy}
+ review -> failed : rejected {role=error}
submitted -> failed : card declined {role=error}
paid -> end

steps:
  submitted -> review   "Risky orders stop here. Nothing has been charged yet."
  review -> paid        "An approved order is charged exactly as before."
  review -> failed      "A rejected order fails without a charge, so there is no refund to issue."
```

Orders under the threshold are charged at once, as before. The threshold is read once at
submit (`src/orders/submit.ts:58`), so changing it never moves an order that is already
[in review](#order.review).

## What it touches

The `orders.status` column gains the value `review`. The nightly export filters on status
(`jobs/export.sql:12`) and does not know it, so orders in review are left out of that night's
report.
````

## 5. Write each figure well

- **The title names what the figure shows**, in the reader's words: "Order lifecycle", "What happens when a card is declined". The heading above it, or the sentence before it, states the point.
- **Labels are what the reader sees or cares about**, not code. A state is "Waiting for review", not `PENDING_REVIEW`. An edge is "card declined", not `onDeclineCb`. Put the code name in the prose, or in a `note` when the reader will go looking for it.
- **Labels are short.** A node is a noun phrase, an edge a few words. A condition goes at the end: "retry [under 3 attempts]". Anything that needs a sentence goes in a step caption or the prose.
- **Roles carry the point.** One `focus`. `happy` and `error` only where the outcome matters. `muted` for context the reader can skip.
- **Keep it small.** Aim for five to twelve nodes. A figure near `press check`'s limits is a wall. To shrink one, give one node to parts that act the same, leave out edges the point does not need, and split the rest into a second figure. Say in the prose what you left out.
- **Step captions say why, not what.** The arrow already says "API writes order". The caption says "Only a paid order is written, so a failed charge leaves nothing behind." Three to six steps, along the path that matters.
- **Prose and figure never repeat each other.** The prose gives the claim and the reason; the figure gives the structure. Point from prose into the figure with `[the retry](#order.failed->submitted)` instead of describing where to look.
- **Write plainly.** Short sentences, concrete names, one name per concept. Say what the code does, not how it feels. No framing such as "the key insight" or "at its core". Never write `{color=…}`; meaning only.
- **Leave layout to Press.** `direction` is the only hint, and you rarely need it. Never add nodes or reorder lines to push the layout around.

## 6. Check, then look

1. Run `press check doc.md` (in a clone of Press without `npm link`, `node src/cli.ts check doc.md`). Fix every error and warning; each names the line and a fix you can apply as written.
2. Look at the result. `press build doc.md -o doc.html` for the screen, `press build doc.md -o doc.pdf` for paper (needs `typst`). Without a browser, `press preview doc.md` draws every figure in the terminal, and the same mistakes show there. The checker cannot see a raw id used as a label, text shrunk too small, or a figure that says something other than you meant.
3. Test each figure: could a reader who knows nothing about this answer "what talks to what" or "what happens when X fails" from it in under a minute? If not, it is too big or it makes no point.
4. Check each figure against the code once more. Every edge you drew, you can point at.

When you hand back, give the path to the document and the built output. Say what you left out, what you could not trace, and whether you looked at the result. If you could not look, say so.
