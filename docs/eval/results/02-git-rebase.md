# Merge vs rebase

`git merge` and `git rebase` solve the same problem: your branch and `main` have both moved on
since you branched, and you want to bring them together. They end with the same *files*. What
differs is the *history* they leave behind, and that difference decides when each one is safe.

## The starting point

Say you branched `feature` off `main` at commit B. Since then you made commits D and E, and
someone else pushed C to `main`.

```architecture id=start title="Two branches that have diverged" direction=right
a: "A"
b: "B"
c: "C" {note="main"}
d: "D"
e: "E" {role=focus, note="feature"}
a -> b
b -> c
b -> d
d -> e
```

## Merge: record that the branches met

`git switch main && git merge feature` creates a new **merge commit** M with two parents, C and
E. Nothing that already existed changes: A through E keep their hashes, and the graph now shows
honestly that work happened in parallel and was joined at M.

```architecture id=merged title="After git merge" direction=right
a: "A"
b: "B"
c: "C"
d: "D"
e: "E" {note="feature"}
m: "M" {role=focus, note="merge commit, main"}
a -> b
b -> c
b -> d
d -> e
c -> m
e -> m
```

The strengths are safety and truth. Merging never rewrites a commit, so it is always safe on a
branch other people have pulled. The cost is noise: a busy repository fills with merge commits,
and `git log` becomes a braid that is hard to read or bisect.

## Rebase: replay your work on the new base

`git switch feature && git rebase main` takes the commits that are only on `feature` (D and E),
sets them aside, moves `feature` to point at C, and re-applies each one on top. The results, D'
and E', contain the same changes but are **new commits with new hashes**, because their parent
changed.

```architecture id=rebased title="After git rebase" direction=right
a: "A"
b: "B"
c: "C" {note="main"}
d2: "D'" {note="replayed"}
e2: "E'" {role=focus, note="replayed, feature"}
a -> b
b -> c
c -> d2
d2 -> e2
```

History is now a straight line, as if you had started your work after C. A later merge into
`main` can fast-forward with no merge commit at all. That makes `git log` read like a story and
makes `git bisect` simpler.

The cost is that rebase **rewrites history**. The old D and E still exist in anyone else's clone.
If a teammate had built on them and you force-push the rebased branch, their history and yours now
disagree, and untangling it is painful. Conflicts also arrive one commit at a time during a rebase,
which is clearer for small branches and tedious for long ones.

## Which to use

```decision-tree id=choose title="Merge or rebase?"
shared: "Has anyone else pulled this branch?"
into: "Bringing main into your branch, or your branch into main?"
review: "Does the team want each feature visible as a unit?"
rebase: "Rebase" {role=happy}
merge: "Merge"
squash: "Rebase, then merge with --no-ff"
shared -> merge : yes
shared -> into : no
into -> rebase : main into mine
into -> review : mine into main
review -> squash : yes
review -> rebase : no
```

A rule of thumb that covers most teams:

- **Rebase private work.** Before opening a pull request, `git rebase main` (or `git pull
  --rebase`) to update your own branch. Nobody else depends on those commits, and a linear branch
  is easier to review.
- **Merge shared work.** Once a branch is public, or when you land it on `main`, merge. Many teams
  use `--no-ff` so each feature appears as one merge commit that can be reverted as a unit.
- **Never rebase commits that exist outside your machine** unless everyone who has them agrees.

`git rebase -i` is a related tool worth knowing: it lets you squash, reorder and reword your own
commits before anyone sees them, which is the same idea of tidying private history.
