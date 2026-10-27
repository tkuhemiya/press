# 02 git-rebase: notes

## Types used and why
- `architecture` x3 (start, merged, rebased) with `direction=right`, nodes without a kind: used as a **commit graph**. Edges are parent -> child. This is a workaround; there is no commit-graph type.
- `decision-tree` (choose): "when to use each" is a short chain of questions with answers.

## Checker rounds
- Round 1 (first draft copy): 0 errors, 0 warnings. **But the first draft was wrong in a way the checker can't see**: I had used `timeline` with `group "main" {..}` / `group "feature" {..}` to show branches as lanes. Rendering showed that timeline groups are consecutive *bands along one time axis*, not parallel lanes. `feature` (D, E) was drawn entirely after `main` (A, B, C), which says the wrong thing (D after C). Edges were drawn as arcs under the axis.
- I then tried `architecture` with the same groups: each group is laid out as one block, so feature still sat to the right of all of main.
- Fix: architecture with **no groups** and `direction=right`. The layered layout then puts C and D in the same column, which reads as a real DAG. Branch names went into `{note=...}`.
- Round 2 (after rewrite): 0 errors, 0 warnings.
- Did the message tell me how to fix it? N/A: there were no messages. The problem was only visible by rendering.

## Wanted but couldn't express
- **A git/commit graph type** (lanes per branch, commits as dots, branch/HEAD labels as pointers, merge commits with two parents). This is the single most important diagram for this topic. Workaround: kindless architecture nodes in a DAG. It works but loses lanes and branch pointers, and architecture edges mean "standing connections", not "parent of".
- **Branch labels as pointers** (`main`, `feature`, `HEAD` pointing at a commit, moving after rebase). I used `note=` on the tip commit instead.
- **Before/after in one figure.** Rebase is a transformation: D,E become D',E'. Ideally one diagram shows the old commits as `muted`/ghosted and the replayed ones beside them, or steps animate the move. I used three separate diagrams. I could have kept the orphaned D, E in the rebased diagram as `{role=muted}`, but with no lanes it got confusing.
- **Parallel lanes in a timeline** (swimlanes): timeline groups looked like they'd do this, but they are sequential bands.

## Skill gaps
- "a group becomes a band" (timeline) is ambiguous: I read "band" as a horizontal lane (swimlane). It is actually a span of the time axis. One sentence ("groups are consecutive stretches of time, not parallel lanes") would have prevented the wrong draft.
- `note` is mentioned ("`note` is for a short qualifier under a label") but its syntax is never shown. I guessed `{note="..."}` and it worked.
- Not stated whether architecture nodes may omit the kind, or what a kindless node looks like (it worked).
- No guidance on "what to do when no type fits"; that's when an agent most needs it.
