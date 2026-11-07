---
name: press-guide
description: Use when someone wants a guide, manual, handbook or onboarding document for a whole project, service or repository, especially as a PDF; when they ask "help me understand this codebase", "write the guide a new engineer would need", or "document how this system works end to end"; and when they want an existing Press guide refreshed after the code has moved on.
---

# A project guide with Press

You write a guide that lets someone understand a whole project: why it exists, what it is made of, what it remembers, what happens when it runs, what happens when it fails, and how people work on it. Press turns it into a PDF (and a web page) with the diagrams laid out and typeset.

Press is Markdown with diagram fences. The language, and what each diagram type is for, is in [`references/language.md`](references/language.md). Read it before you write the first fence.

The list of what a guide can cover is in [`references/checklist.md`](references/checklist.md). Each item says why it matters, where it hides in code, when to include it, and how to show it. Read it before you start exploring.

## What a reader needs

A reader who finishes the guide can answer six questions:

1. **Why does this exist?** Purpose, users, the words the team uses, the decisions that shaped it.
2. **What is it made of, and where does it end?** The parts, every way in and out, what it depends on, where trust changes, where the code lives.
3. **What does it remember?** The data, who owns each copy, the lifecycles, the rules that must hold, the state outside the database.
4. **What happens when it runs?** The main paths, the work that runs on a clock, the settings that change behaviour, concurrency, where it runs.
5. **What happens when things go wrong?** Failure of each dependency, retries and load, how you know it is healthy, how to recover.
6. **How do people work on it?** The dev loop, the scripts, the path to production, migrations, tests, conventions, owners.

Most architecture documents stop after the second. Go further: the third, fourth and sixth are where a newcomer loses the most time.

## 1. Survey, then choose what to cover

Paper is a budget. A guide that covers every item at full depth is a reference nobody reads. Choose.

1. **Survey the repo in a few minutes.** README, the top-level directories, the build and package files, the entry points (`main`, routes, handlers, CLI commands, consumers), the schema or migrations, the infra files, CI config, the `scripts/` or `bin/` directory, cron or scheduler config.
2. **Take the core.** These are always in: purpose (1.1), glossary (1.2), the map (2.1), the edges (2.2), the data model (3.1), lifecycles (3.3, if there is any state field), and the main paths (4.1).
3. **Add what the code shows exists.** Each item in the checklist has an "Include when" line naming the signal. A `cron` entry pulls in time-driven work. A retry library pulls in load behaviour. A `scripts/` directory pulls in scripts. A replica or cache pulls in data ownership. No signal, no section.
4. **Write the outline before you read deeply**: the chapters and, under each, one line per figure, each a claim. "Orders are only written after the charge succeeds." Drop any figure that does not change what the reader knows.

## 2. Explore

Press never reads code. You do, and every node and edge you draw is a claim about the code. Draw only what you traced.

- **Start from the edges of the system** and follow one real request and one real job end to end. Tests show intended behaviour and the edge cases. Git history and ADRs show why.
- **Keep three kinds of claim apart.** What the code shows (cite it: `src/orders/submit.ts:42`). What you infer (say "appears to"). What you could not find. A figure states only the first; the prose may state the others, marked as such.
- **Never invent a number.** A latency, a replica count, a schedule or a timeout appears only if it is in the code, the config or a measurement you have.
- **Note what surprised you.** The retry that loops, the state that cannot be left, the job that rewrites what a request just wrote. These become the best figures and the gotchas.

**Split a big repo.** If you can start subagents, give each one an angle and [`references/explorer-prompt.md`](references/explorer-prompt.md) with the angle filled in. Start them together. Good angles, one per explorer, for the chapters you chose:

- The edges and dependencies (chapter 2)
- The data and its states (chapter 3)
- The main paths and the work on a clock (chapter 4)
- Failure, load, deploy and observability (chapters 4.5 and 5)
- Ways of working: dev loop, scripts, CI, release, migrations (chapter 6)

Then write the guide yourself from what they return, and check anything they disagree on. For a small repo, read it yourself.

## 3. Shape the guide

Use this order. Drop a section with nothing to say; keep the numbering of the questions in your head, not in the headings.

```text
# <Project>: how it works
  one paragraph: what it is, who uses it, why it exists
  the commit the guide describes, and the date
  ## How to read this          which chapters each reader needs
## Why it exists               purpose, glossary, key decisions
## The map {page=new}          parts, edges, dependencies, trust, code map
## What it remembers {page=new} data model, ownership, lifecycles, invariants, other state
## What happens when it runs {page=new}   main paths, work on a clock, config, concurrency, where it runs
## When things go wrong {page=new}        failures, load, observability, recovery
## Working on it {page=new}    dev loop, scripts, path to production, migrations, tests, conventions, owners
## Gaps                        what you could not trace, and what to ask a person
## Appendix {page=new}         entry point table, scripts table, file map
```

- **How to read this.** Name two or three readers and their path. A new engineer: why, map, runs, working on it. On call: dependencies, when things go wrong, work on a clock. A reviewer or product lead: why, map, what it remembers.
- **Start small and build up.** The map has five to nine nodes. Every later figure zooms into one part of it or adds one thing. A reader who watches the system assemble understands it.
- **Keep the cast stable.** The same thing has the same id, label and kind in every figure and the same name in the prose. Write the glossary first and use its words everywhere.
- **Use steps for order inside a figure.** A path through a figure is `steps:`, not three figures. Paper shows steps as numbered markers on one frame.
- **Tables for catalogues.** Every entry point, every script, every config key, every owner: a Markdown table, not a diagram. Never draw boxes with nothing connecting them.
- **Name real things.** "`OrderService.submit` calls `Payments.charge` before it opens the transaction", not "the service delegates to the payment layer". Each section ends with the two or three files to open, as `path:line`.
- **Aim for a guide someone reads in one sitting**: roughly 10 to 25 pages for one service. Push detail into the appendix before you push it into the chapters.

Save the source where the next person will find it: `docs/press/guide.md` unless the user names a place, with the built `guide.pdf` next to it. Give each figure a stable `id`, because a later explanation of a change can start from the same fence and mark it with `+` and `-` lines.

## 4. Write each figure well

- **The title names what the figure shows**, in the reader's words: "Order lifecycle", "What happens when a card is declined". The sentence before it states the point.
- **Labels are what the reader sees or cares about**, not code. "Waiting for review", not `PENDING_REVIEW`. Put the code name in the prose or in a `note`.
- **Roles carry the point.** One `focus`. `happy` and `error` only where the outcome matters. `muted` for context the reader can skip.
- **Five to twelve nodes.** To shrink a figure, merge parts that act the same, leave out edges the point does not need, and split the rest into a second figure. Say in the prose what you left out.
- **Step captions say why, not what.** Not "API writes order" but "Only a paid order is written, so a failed charge leaves nothing behind."
- **Prose and figure never repeat each other.** Point from prose into the figure with `[the retry](#order.failed->submitted)`.
- **Write plainly.** Short sentences, concrete names, one name per concept. Never write `{color=…}`.

## 5. Build, check and look

1. `press check docs/press/guide.md` (in a clone of Press without `npm link`, `node src/cli.ts check …`). Fix every error and warning; each names the line and a fix.
2. `press build docs/press/guide.md -o docs/press/guide.pdf` (needs `typst` on PATH). Also build `-o guide.html` if the reader will use it on screen. Without either, `press preview docs/press/guide.md` draws it in the terminal.
3. Look at the PDF page by page. A figure that shrank too small, a raw id used as a label, a section split badly: fix the source, not the output.
4. Check each figure against the code once more. Every edge you drew, you can point at.
5. Check the guide against the reader. Could a new engineer answer each of the six questions from it? Could someone on call find what to do when a dependency is down?

When you hand back, give the path to the source and the PDF, the commit it describes, the chapters you left out and why, and what you could not trace. If you could not look at the PDF, say so.

## Refreshing a guide

When the code has moved on, read the commit the guide names and diff from there: `git log --oneline <commit>..HEAD` and `git diff <commit>..HEAD --stat`. Walk the checklist against the diff. Update only the figures and tables whose claims changed, keep every id and label that still holds, and move the commit and date at the top.
