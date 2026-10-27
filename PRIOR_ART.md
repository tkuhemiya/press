# Prior art

Open-source projects we have studied, what we take from each, and when. Add a project when you study it, and mark each item "in use" once it lands.

Status: `taking` (in use or being built in) · `later` (planned for a later version) · `reference` (worth knowing; nothing to take now)

## Diagram rendering

| Project | What it is | What we take | Status |
|---|---|---|---|
| [obsidianmd/pele](https://github.com/obsidianmd/pele) | Mermaid to SVG, synchronous, no runtime dependencies, MIT | Its layered layout, vendored in `src/layout/pele` for state machines. It beat elkjs side by side: reading order kept, fewer crossings, cleaner curves, compound groups ([comparison](docs/decisions/layout-pele-vs-elk.png)). Text measured from a table of character widths instead of a DOM. | taking (in use) |
| [lukilabs/beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) | Mermaid to SVG or ASCII, built on elkjs | A full theme derived from two colours. ASCII output as a possible future target, which fits "source readable without rendering". | later |
| [blushft/go-diagrams](https://github.com/blushft/go-diagrams) | Architecture diagrams from Go code, a port of mingrammer/diagrams | Considered for `architecture` node kinds. We drew our own line glyphs instead, so every kind shares one visual language with the rest of Press. Vendor logos would also need a licence check. | reference |

## Rejected

| Project | Why not |
|---|---|
| [kieler/elkjs](https://github.com/kieler/elkjs) | Compared with pele on three state machines. With matching settings it lost reading order (`start` landed mid-graph), stretched larger graphs, and routed compound edges poorly. It is also asynchronous and about 1.5 MB. |

## Explanations, steps and motion

| Project | What it is | What we take | Status |
|---|---|---|---|
| [ivarvong/lantern](https://github.com/ivarvong/lantern) | Steppable, animated explainers that render to SVG | Every step is addressable by URL (`#order/3`, in use). Node running TypeScript directly with no build step (in use). A contact sheet of every step, to check renders (not built yet). | taking |
| [kitlangton/psychopomp](https://github.com/kitlangton/psychopomp) | Code-first motion graphics and narrated explainers in Rust | Animation quality: every frame is a pure function of time (in use: the step dot), and interrupted motion keeps its velocity (not yet: an interrupted step jumps). The walkthrough's transitions should feel this good. Its sound design is admired but has no place in a document. Its visuals are not the model. | taking (motion) |
| [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) | A Claude skill that explains an idea by building a working object | Ship a skill file that teaches agents to write Press well. | later |
| [kitlangton/behold](https://github.com/kitlangton/behold) | Markdown workspace that upgrades semantic fences (`timeline`, `tree`, `diff`…) into components | A close sibling. Check its fence vocabulary when designing later types. | reference |

## Typography and print

| Project | What it is | What we take | Status |
|---|---|---|---|
| [jemmybutton/byrne-euclid](https://github.com/jemmybutton/byrne-euclid) | Byrne's colour-coded Euclid, rebuilt in MetaPost and LaTeX | Colour as reference, with Tufte's small letters on the figure: the precedent for letter markers on prose references. Prose references take their node's colour in HTML. | taking |
| [enesozturk/dimensional-drawing](https://github.com/enesozturk/dimensional-drawing) | A skill that draws UI components as Apple-style dimensional drawings | Things are told apart by line weight, dashes and hatching, not colour alone. Roles must survive grayscale print. | taking |
| [anomalyco/justice](https://github.com/anomalyco/justice) | Knuth-Plass paragraph justification for the web, 4.5 KB, no dependencies | Better justified prose. | later |

## Later diagram types

| Project | What it is | What we take | Status |
|---|---|---|---|
| [koaning/wigglystuff](https://github.com/koaning/wigglystuff) | Interactive notebook widgets (matrix, sliders, curves) | Interaction ideas for the ML types. | later (v0.3+) |
| [goptics/vizb](https://github.com/goptics/vizb) | Tabular data to ECharts charts | Reference for `plot`. | later |
| [organui/organui](https://github.com/organui/organui) | Healthcare UI components, including anatomy | Reference for biology types. | reference |
| [kitlangton/motel](https://github.com/kitlangton/motel) | Local OpenTelemetry viewer | A trace or span waterfall as a possible diagram type. | reference |
| [danielwh2/drawably](https://github.com/danielwh2/drawably) | Hand-drawn UI controls from seeded strokes | A possible sketch theme. | reference |
| [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus) | TLA+ tools | A model checker's error trace is a `steps:` walkthrough over a state machine. Not studied in depth. | reference |
