# Visualizations

Every diagram type we plan to support. Update the status when work starts or lands.

Status: `planned` → `spec` (syntax agreed in SPEC.md) → `building` → `done`

## Roadmap

- **v0.1:** core grammar, parser, HTML + print renderers, `state-machine`, `sequence`, steps, prose references
- **v0.2:** `architecture`, `causal-loop`, `timeline`
- **v0.3:** properties in the shared grammar, `decision-tree`, `er`, `tradeoffs`, and a skill file that teaches agents to write Press
- **v0.4:** phases in `sequence`, lanes and times since the start in `timeline`, caveats in `tradeoffs`, prose links to edges, phases and loops. Chosen from the authoring eval (`docs/eval/REPORT.md`)
- **v0.5:** native Typst print, page-aware figure sizing, and page hints on headings
- **v0.5 and later:** the rest, prioritized by what software explanations need most

## Software

| Type            | Shows                                   | Version | Status  |
|-----------------|-----------------------------------------|---------|---------|
| `state-machine` | States and transitions                  | 0.1     | done    |
| `sequence`      | Messages between participants over time | 0.1     | done    |
| `architecture`  | Components, boundaries, connections     | 0.2     | done    |
| `data-flow`     | How data moves and transforms           | —       | planned |
| `er`            | Entities and relationships              | 0.3     | done    |
| `call-stack`    | Stack frames over time                  | —       | planned |
| `memory-layout` | Bytes, pointers, structs                | —       | planned |

## Systems and economics

| Type             | Shows                              | Version | Status  |
|------------------|------------------------------------|---------|---------|
| `causal-loop`    | Feedback loops with polarity       | 0.2     | done    |
| `stock-and-flow` | Accumulations and rates            | —       | planned |
| `supply-demand`  | Curves, equilibrium, shifts        | —       | planned |

## Time

| Type       | Shows                  | Version | Status  |
|------------|------------------------|---------|---------|
| `timeline` | Events in order        | 0.2     | done    |

## ML

| Type          | Shows                              | Version | Status  |
|---------------|------------------------------------|---------|---------|
| `compute-graph` | Operations and tensors           | —       | planned |
| `tensor-shapes` | Shape changes through a model    | —       | planned |

## Math and physics

| Type          | Shows                                  | Version | Status  |
|---------------|----------------------------------------|---------|---------|
| `plot`        | Functions and data                     | —       | planned |
| `commutative` | Commutative diagrams                   | —       | planned |
| `free-body`   | Forces on a body                       | —       | planned |
| `block`       | Block diagrams with feedback (control) | —       | planned |

## Biology

| Type      | Shows                         | Version | Status  |
|-----------|-------------------------------|---------|---------|
| `pathway` | Reactions and regulation      | —       | planned |
| `cycle`   | Cyclic processes              | —       | planned |

## Reasoning

| Type            | Shows                               | Version | Status  |
|-----------------|-------------------------------------|---------|---------|
| `argument-map`  | Claims, support, objections         | —       | planned |
| `decision-tree` | Choices and outcomes                | 0.3     | done    |
| `tradeoffs`     | Options compared across criteria    | 0.3     | done    |
