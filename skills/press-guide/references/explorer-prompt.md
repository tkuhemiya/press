# Explorer brief

Fill in the placeholders and give this to each explorer. Start all explorers at once. Each one reads; none of them writes.

---

You are one of several explorers reading the same repository for a guide that explains the whole project. Others are covering other angles at the same time. Do not try to cover everything. Go deep on your angle.

Your findings will become diagrams and tables, so report them in the shapes below. Every item needs a `file:line` you read. If you did not trace something, put it under Open questions, not in the other sections. Leave out any section with nothing on your angle.

## The project

{ONE_LINE_ABOUT_THE_PROJECT}

## Your angle

{ANGLE, e.g. "The data and its states: the data model, who owns each copy, every lifecycle, the invariants, state outside the database."}

## Report

### Parts

The services, modules, stores, queues, caches and outside systems on your angle. For each: a short name a person would say, what kind of thing it is, the `file:line` where it is defined or built, and one sentence on what it does.

### Ways in and out

Every route, command, consumed topic, webhook, schedule and manual entry point on your angle, and every call, event, file or message going out. For each: its name, what triggers it, what it does in one line, `file:line`.

### Connections and dependencies

Who calls, sends to, or reads from whom. For each: from, to, what travels, whether the caller waits, and the `file:line` of the call. For each outside dependency: what happens here when it is slow or down (fails, degrades, or nothing), and the `file:line` that decides it.

### Data and its owners

Tables, collections or message formats: the fields that matter and what refers to what, with the migration or model `file:line`. For each, whether this system is the source of truth or holds a copy, and what keeps the copy current.

If the code reads or writes bytes at fixed offsets (a binary format, a `#[repr(C)]` or C struct, a page or record header), list the fields in memory order with their types and sizes, any padding, and what each pointer points at.

### States

Any field or variable that moves something through a lifecycle (`status`, `phase`, an enum, a pair of booleans). The values, each move between them, what causes each move, the `file:line` where it happens. Say which values are final.

### Rules that must hold

Invariants, and where each is enforced: a constraint, a check in code, or nowhere.

### One path in order

Follow one real request or job from its trigger to its end. Number the steps: who acts, on whom, with what, at which `file:line`. Mark where it can fail and what happens then. If an error unwinds through several functions or layers, list the frames it passes and the one that catches it.

### Work on a clock and scripts

Cron jobs, workers, schedules, TTLs and scripts. For each: trigger or who runs it, how often, what it reads and changes, whether it is safe to run twice, `file:line`.

### Settings

Config keys and flags that change which path the code takes. Default, where read, what changes.

### Feedback and timing

Retries, backoff, timeouts, TTLs, limits, autoscaling, queues that can grow. The numbers, with the `file:line` they come from. Never estimate one.

### Where it runs

Only if the infra or deploy files are on your angle: places, replicas, what runs where.

### Ways of working

Only if your angle covers it: setup and run commands, CI stages, deploy and rollback, migration order, test layout, conventions, owners.

### Non-obvious

What looks like it works one way and works another. Order that matters. History that explains an odd shape, with the commit or PR if you found it.

### Open questions

What you could not trace, and why.

### Files read

Every file you read.
