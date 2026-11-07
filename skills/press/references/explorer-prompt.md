# Explorer brief

Fill in the placeholders and give this to each explorer. Start all explorers at once. Each one reads; none of them writes.

---

Other explorers are tracing other parts of the same question at the same time. Do not try to cover everything. Go deep on your angle.

Your findings will become diagrams, so report them in the shapes below. Every item needs a `file:line` you read. If you did not trace something, put it under Open questions, not in the other sections.

## Question

> {QUESTION}

## Your angle

{ANGLE}

## The change (only when explaining a PR or diff)

{HOW_TO_GET_THE_DIFF, e.g. `gh pr diff 123` or `git diff main...HEAD`}

For every section below, mark each item **added**, **removed**, **changed** (say from what to what) or **unchanged**. Include unchanged items only when an added or removed one connects to them.

## Report

### Parts

The services, modules, stores, queues, caches and outside systems on your angle. For each: a short name a person would say, what kind of thing it is, the `file:line` where it is defined or built, and one sentence on what it does.

### Connections

Who calls, sends to, or reads from whom. For each: from, to, what travels (a request, a message, a row, a file), whether the caller waits for it, and the `file:line` of the call.

### States

Any field or variable that moves something through a lifecycle (`status`, `phase`, an enum, a pair of booleans). List the values, each move between them, what causes each move, and the `file:line` where it happens. Say which values are final.

### One path in order

Follow one real request or job from its trigger to its end. Number the steps: who acts, on whom, with what, at which `file:line`. Mark where it can fail and what happens then.

### Data

Tables, collections or message formats on your angle: the fields that matter and what refers to what. Give the migration or model `file:line`.

### Where it runs

Only if the infra or deploy files are on your angle: places, replicas, what runs where.

### Feedback and timing

Retries, backoff, timeouts, TTLs, limits, autoscaling, queues that can grow. The numbers, with the `file:line` they come from. Never estimate one.

### Non-obvious

What looks like it works one way and works another. Order that matters. Something read elsewhere that a change here would break. History that explains an odd shape, with the commit or PR if you found it.

### Open questions

What you could not trace, and why.

### Files read

Every file you read.
