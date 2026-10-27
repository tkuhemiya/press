# Press

## The idea

AI can explain almost anything now, but people can't absorb it as fast as AI can produce it. The bottleneck is comprehension, and a wall of text is a poor way to understand a state machine, a feedback loop or a request lifecycle.

Press is a small Markdown-like language for writing explanations that mix prose and visualizations. The author, usually an AI, writes *structure*. Press handles layout, typography and visual design, so every output looks good by default.

## Decisions already made

These were settled deliberately. Don't reopen them without a good reason.

- **HTML first, print as a first-class target.** HTML supports interactivity, LLMs write it fluently, and it shows up wherever people read. Print matters for long-term use, so every visualization must have a good static form. A Typst backend may come later from the same source.
- **Markdown host, fenced blocks for visualizations.** The fence language tag is the diagram type (` ```state-machine `).
- **One shared grammar across all diagram types.** Nodes, edges, attributes, groups and comments look the same everywhere. Each type only adds a few keywords.
- **Meaning, not styling.** Authors write `{role=error}`, never colors or sizes. The visual language belongs to the library.
- **Explicit attributes:** `{key=value, ...}`.
- **Layout hints are limited to `direction`.** The layout engine handles everything else.
- **No raw SVG/HTML escape hatch.** The constraint forces the vocabulary to grow.
- **Steps live inside the fence.**
- **Paper is a budget.** Print should compress (annotate a single frame), not expand (one frame per step). See `SPEC.md`.
- **Pre-1.0 versioning:** 0.1, 0.2, 0.3…
- **Light themes only.** No dark mode. A light page reads well on screen and is already what print needs, so there is one visual language to get right.

## How to work here

- `SPEC.md` is the source of truth for the language. Agree on spec changes before writing code.
- `VISUALIZATIONS.md` tracks every planned diagram type and its status. Update it when you add or change one.
- Source should stay readable without rendering. If a fence makes no sense as plain text, the syntax is wrong.
- Parser errors should name the line and suggest a fix, so an LLM can correct itself.
- `PRIOR_ART.md` records the open-source projects we have looked at and what we take from each. Add to it when you study a new one.
