# Explorer brief

Fill in the placeholders and give this to each explorer. Start all explorers at once. Each one reads; none of them writes.

---

You are one of several explorers reading the same change. Others are covering other dimensions at the same time. Go deep on yours.

Your findings will become one diagram of the change, so report them in the shapes below. Every item needs a `file:line` you read. If you did not trace something, put it under Open questions.

## The change

{HOW_TO_GET_THE_DIFF, e.g. `gh pr diff 123` or `git diff main...HEAD`}

{ONE_LINE_ABOUT_WHY_FROM_THE_PR_BODY}

## Your dimensions

{DIMENSIONS, e.g. "Lifecycle, data model, rules that must hold."}

For each of your dimensions, say first whether the change touches it at all. If it does not, say so in one line and stop there for that dimension.

## Report

Mark every item **added**, **removed**, **changed** (say from what to what) or **unchanged**. Include unchanged items only when an added or removed one connects to them, one hop out.

### What changed

Parts, connections, states and transitions, fields, steps of a path, settings, schedules or scripts, whichever your dimensions cover. For each: a short name a person would say, what kind of thing it is, the mark, and `file:line` before and after.

### What reads it outside the diff

Everything that reads what changed but is not in the diff: callers, consumers of a message, queries on a column, exports, dashboards, other services. For each: `file:line`, and whether the change breaks it, changes it, or leaves it working.

### Rollout and rollback

Whether old and new code can run side by side during the deploy, whether a migration must run first or after, whether a flag guards it, and whether reverting the code undoes the change.

### Tests

What new behaviour the tests cover, with `file:line`, and what they do not.

### Non-obvious

What looks like it works one way and works another. Order that matters.

### Open questions

What you could not trace, and why.

### Files read

Every file you read.
