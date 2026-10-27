# Press

A small Markdown-like language for explanations that mix prose and diagrams. You write
structure; Press handles layout, typography and visual design.

````markdown
```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry

steps:
  draft -> submitted     "The user submits the cart"
  submitted -> failed    "The card is declined"
  failed -> submitted    "They retry with a new card"
```

When the card is declined, [the failed state](#order.failed) loops back.
````

The output is one self-contained HTML file:

- **On screen**, steps become a walkthrough: next and previous, with the current edge
  highlighted and a caption. `#order/2` links straight to step 2. Hovering a prose
  reference points at its node.
- **On paper**, each diagram prints as a single frame. Steps become numbered markers with
  a caption legend, prose references become lettered markers, and diagrams never split
  across pages.

The language is defined in [`SPEC.md`](SPEC.md). [`VISUALIZATIONS.md`](VISUALIZATIONS.md)
lists the diagram types, and [`examples/`](examples) has complete explanations.

## Use

Press needs Node 26 or later.

```sh
npm install
node src/cli.ts build examples/checkout.md --out-dir out   # HTML
node src/cli.ts check doc.md                               # problems only
node src/cli.ts pdf doc.md -o doc.pdf                      # needs Playwright
```

Problems are reported with the line and a fix, so an LLM can correct its own source:

```
doc.md:12: error: Unknown role `danger`.
  fix: Did you mean `role=error`? Roles: `focus`, `error`, `happy`, `muted`.
```

From code:

```ts
import { build } from './src/index.ts';
const { html, diagnostics } = build(markdown);
```

## Develop

```sh
npm test            # parser, rendering, and browser checks (browser checks need Playwright)
npm run typecheck
npm run build:examples
```

Node runs the TypeScript directly, so there is no build step. Layout for graph diagrams
is pele's layered layout, vendored in `src/layout/pele` (MIT); see `PRIOR_ART.md` for why.
Fonts are Inter, Source Serif 4 and JetBrains Mono (SIL OFL), embedded in each page.
