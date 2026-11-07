---
name: press-pr
description: Use when someone wants to see what a pull request, branch, commit or diff does to a system, as an image or a one-page picture; when they ask "visualize this PR", "make an image of the changes", "explain this diff to a reviewer", or want a figure to put in a PR description or comment.
---

# A picture of a change with Press

You make one image that shows what a change does to the running system. The reader is a reviewer, or someone catching up. They can read the diff; they cannot see its shape. A change of thirty files may move one edge. A one-line change may add a state. You draw the effect, not the file list.

Press is Markdown with diagram fences. The language, and what each diagram type is for, is in [`references/language.md`](references/language.md). Read it before you write the first fence. A change is one fence with `+` and `-` lines, described there under "Changes".

## 1. Get the change and its reason

```sh
gh pr view 123 --json title,body,files,commits,closingIssuesReferences
gh pr diff 123                        # or: git diff main...HEAD
git log --oneline main..HEAD
```

The PR body, the linked issue and the commit messages say why. The diff says what. Neither says what it does to the running system. For that, read around the diff: the callers of what changed, the code before the change, and everything else that reads the same data or parses the same message. Press never reads code; every node and edge you draw is a claim you traced.

For a large PR, if you can start subagents, split it by the dimensions below and give each subagent [`references/explorer-prompt.md`](references/explorer-prompt.md) with its dimensions filled in. Read a small PR yourself.

## 2. Fingerprint the change

Walk every dimension and answer: did this change it? Most changes touch one or two. These are the same things a reader needs to understand a whole system, so a change to any of them changes what the reader knows.

| Dimension | It changed if the PR… | Draw it as a diff in a |
|---|---|---|
| Ways in and out | adds, removes or reshapes a route, command, consumed or emitted event, webhook, schedule, outgoing call | `architecture` or `sequence` |
| Dependencies | adds a dependency, removes one, or turns a soft one hard (now fails when it is down) | `architecture` |
| Parts | adds, removes or rewires a service, worker, queue, cache or module | `architecture` or `c4` |
| Trust | moves personal, payment or secret data somewhere new, or moves an auth check | `data-flow` |
| Data model | changes tables, columns, keys, references, or a stored document's shape | `er` |
| Data ownership | adds a copy of data, or changes what keeps a copy current | `data-flow` |
| Lifecycle | adds or removes a state, or changes what moves between states | `state-machine` |
| Rules that must hold | loosens, adds or moves where an invariant is enforced | prose, linked into the lifecycle or `er` figure |
| Main path | adds a hop, reorders calls, adds a cache check, a retry or a timeout | `sequence` |
| Work on a clock | adds or changes a cron, worker, schedule or TTL | `sequence` or `timeline` |
| Settings | adds a flag, changes a default, or changes which path a setting picks | `decision-tree` |
| Concurrency | changes a transaction, lock, idempotency key or ordering | `sequence` or `timeline` |
| Load and failure | changes retries, backoff, limits, fallbacks, or what happens when a dependency fails | `causal-loop` or `sequence` |
| Where it runs | changes replicas, regions, resources, or where something runs | `deployment` |
| Ways of working | adds or changes a script, CI step, deploy step or migration process | prose, or `sequence` when order matters |
| Choice | was picked over alternatives the reviewer will ask about | `tradeoffs` |

The answer is the fingerprint: the list of dimensions that changed, in plain words, such as "a lifecycle and a setting". It goes on the image.

**Look past the diff.** The most important effects are often not in the changed lines: a column another service reads, a message format a consumer parses, a flag default, a cache key, a status value an export filters on. Put them in the figure or under "Touches".

**Then ask four questions every change raises:**

- **Contracts.** Who else reads what changed? Is the change backward compatible for them?
- **Rollout.** While it deploys, old and new code run side by side. Does that work? Must a migration run first, or after?
- **Rollback.** Is it behind a flag? Can it be reverted, or does it change data in a way that cannot be undone?
- **Tests.** What new behaviour is not tested?

A pure refactor with no change in behaviour fingerprints as nothing. Say so in one sentence, or draw an `architecture` diff of modules if the shape of the code is the point.

## 3. Choose the figure

The image has one figure, two at most. Pick the dimension whose change matters most to the reader: usually the one that changes behaviour a user or another team sees. Mention the other dimensions in the fingerprint line.

**If the repo has a Press guide** (for example `docs/press/guide.md`), start from the figure there that shows this part of the system. Copy its fence, keep its ids and labels, cut it down to the part the change touches, and mark the change. The reader then sees a picture they already know, with the change in it. Say in your hand-back which guide figures the change makes out of date.

**Draw one fence with `+` and `-` lines.** Show the change in its context, like a diff's context lines: keep the unchanged parts the change touches, one hop out, and leave the rest of the system out. Never draw a before figure and an after figure.

- Five to twelve nodes. One `focus`, on the heart of the change.
- Labels are what the reader sees or cares about, not code: "Waiting for review", not `PENDING_REVIEW`.
- Mark every line that mentions a new node with `+`.
- **No `steps:` in the image.** On screen they are a walk-through the image cannot show. Put the reasons in the sentences around the figure instead.

## 4. Write the card

The image is a short Press document. Keep it to what fits on one screen:

```text
# <What changes in behaviour, in plain words>
One to three sentences: the problem, and what the change does about it.
<the figure>
One line: the detail in the figure worth checking.
**Changes:** the fingerprint.  **Touches:** who or what else is affected.  **Check:** the one or two places to look hardest, as file:line.
```

The title says what changes in behaviour: "Checkout: risky orders wait for a fraud review", not "PR #123" or "Refactor payment module". Leave **Touches** out when nothing outside the diff is affected; never leave out a risk to make the card shorter.

An example, as source:

````markdown
# Checkout: risky orders wait for a fraud review

Orders over the risk threshold now stop for a fraud review before they are charged. Before
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
```

A rejected order fails before any charge, so there is no refund to issue.

**Changes:** a lifecycle and a setting. **Touches:** the nightly export filters on status
(`jobs/export.sql:12`) and leaves orders in review out of that night's report. **Check:**
`src/orders/submit.ts:58`, where the threshold is read once at submit.
````

Write plainly. Short sentences, concrete names, one name per concept. Never write `{color=…}`.

## 5. Build the image and look at it

Save the card next to where it will be used, for example `pr-123.md`. In a clone of Press without `npm link`, use `node src/cli.ts` for `press`.

```sh
press check pr-123.md
press build pr-123.md -o pr-123.html
npx playwright screenshot --full-page --viewport-size=1000,700 "file://$PWD/pr-123.html" pr-123.png
```

The first run of `npx playwright` may need `npx playwright install chromium`. Any headless browser that takes a full-page screenshot works the same way.

Then open `pr-123.png` and look at it. A raw id used as a label, a figure too crowded to read, a removed edge that hides an added one: fix the source and build again. If the user wants paper instead, `press build pr-123.md -o pr-123.pdf` (needs `typst`).

**Before you finish, walk the diff hunk by hunk.** Every hunk that changes behaviour is in the figure, in the card's text, or named in your hand-back as left out.

When you hand back, give the path to the image and its source, the fingerprint, what you left out, what you could not trace, and any guide figures the change makes out of date. If you could not look at the image, say so.
