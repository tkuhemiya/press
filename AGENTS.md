# Press

## The idea

AI can explain almost anything now, but people can't absorb it as fast as AI can produce it. The bottleneck is comprehension, and a wall of text is a poor way to understand a state machine, a feedback loop or a request lifecycle.

Press is a small Markdown-like language for writing explanations that mix prose and visualizations. The author, usually an AI, writes *structure*. Press handles layout, typography and visual design, so every output looks good by default.

## Decisions already made

These were settled deliberately. Don't reopen them without a good reason.

- **HTML first, print as a first-class target.** HTML supports interactivity, LLMs write it fluently, and it shows up wherever people read. Print matters for long-term use, so every visualization must have a good static form. PDF is typeset by Typst from the same source.
- **Markdown host, fenced blocks for visualizations.** The fence language tag is the diagram type (` ```state-machine `).
- **One shared grammar across all diagram types.** Nodes, edges, attributes, groups and comments look the same everywhere. Each type only adds a few keywords.
- **Meaning, not styling.** Authors write `{role=error}`, never colors or sizes. The visual language belongs to the library.
- **Explicit attributes:** `{key=value, ...}`.
- **Layout hints are limited to `direction` on diagrams and `page` on headings.** The layout engine handles everything else.
- **No raw SVG/HTML escape hatch.** The constraint forces the vocabulary to grow.
- **Steps live inside the fence.**
- **Paper is a budget.** Print should compress (annotate a single frame), not expand (one frame per step). See `docs/SPEC.md`.
- **Pre-1.0 versioning:** 0.1, 0.2, 0.3…
- **Vendor icons are the one exception to Press-chosen colour.** `aws.lambda`, `k8s.pod` and the like draw the vendor's own artwork in colour, because readers recognise them. Everything else stays meaning, not styling.
- **Light themes only.** No dark mode. A light page reads well on screen and is already what print needs, so there is one visual language to get right.

## How to work here

- `docs/SPEC.md` is the source of truth for the language. Agree on spec changes before writing code.
- `docs/VISUALIZATIONS.md` tracks every planned diagram type and its status. Update it when you add or change one.
- Source should stay readable without rendering. If a fence makes no sense as plain text, the syntax is wrong.
- Parser errors should name the line and suggest a fix, so an LLM can correct itself.
- `docs/PRIOR_ART.md` lists projects to open when an implementation gets stuck. A row says what the project is and the problems it covers. Add a row when you study a project.

## Code

- Node 26+, TypeScript run directly (erasable syntax only: no enums, namespaces or parameter properties). `npm test`; `npm run check` checks formatting (oxfmt), lints (oxlint, type-aware) and typechecks.
- `src/model.ts` has one type per diagram. `src/parse/grammar.ts` turns a fence into plain statements, and each type's file in `src/diagrams` builds its model from them (with its own checks) and draws it; `src/diagrams/diagram.ts` registers them. `src/parse/document.ts` reads the Markdown, and `src/render` builds the page (`style.css`, `client.js`) and the paper (`typst.ts` and `press.typ`).
- No `as` or `!` (lint errors); brand ids and `Html` in `src/brand.ts` only.
- Diagram SVG carries meaning as classes and `data-role`, never colours; styling lives in `style.css` for the screen and in `src/render/press.typ` for paper. Print has no browser stylesheet.
- No comments in code; they go stale. Let names, types and tests carry the meaning. The one exception is `src/layout/pele`.
- `src/layout/pele` is vendored. Keep changes there minimal and note them in the file header.
- After a visual change, build the examples and look at them on screen and in print (`node src/cli.ts build doc.md -o doc.pdf`, which needs `typst` on PATH).
