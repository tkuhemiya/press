# How Press works

The README figure is a screenshot of the diagram below.

The author writes Markdown with fenced diagrams. Press parses that into a typed
document, lays each figure out once, and draws the same model three ways.

```architecture id=pipeline title="How Press works" direction=right
author: user "Author"

group "Parse" {
  document: service "Document parser" {note="parseDocument"}
  grammar: service "Shared grammar"
}

group "Diagrams" {
  types: service "Diagram types" {note="build · render"}
  model: database "Typed model" {role=focus}
}

group "Layout" {
  pele: service "Pele"
  scene: service "Scene"
}

group "Render" {
  html: client "HTML" {note="screen"}
  paper: client "PDF" {note="paper"}
  term: client "Terminal" {note="preview"}
}

author -> document : Markdown
document -> grammar : fences
grammar -> types : statements
types -> model : build
model -> pele : graphs
pele -> scene : positions
scene -> html : SVG
scene -> paper : Typst
model -> term : cells {role=muted}

steps:
  author -> document     "The author writes structure in Markdown; fences name the diagram type."
  document -> grammar    "The document parser finds each fence and hands it to the shared grammar."
  grammar -> types       "Every type sees the same statements: nodes, edges, groups, attributes, steps."
  types -> model         "The type's DiagramDef builds a typed model and reports problems with a fix."
  model -> pele          "Graph diagrams ask Pele for ranks and positions; the result is a scene."
  scene -> html          "HTML, PDF and the terminal all draw from that model; styling stays out of the source."
```

[`parseDocument`](../src/parse/document.ts) reads the Markdown host.
[`grammar.ts`](../src/parse/grammar.ts) turns a fence into statements.
Each file in [`src/diagrams`](../src/diagrams) implements `DiagramDef`: `build`
and `render`, registered in [`diagram.ts`](../src/diagrams/diagram.ts). Types live
in [`model.ts`](../src/model.ts). Layout goes through Pele into a
[`Scene`](../src/scene/scene.ts). [`render/html.ts`](../src/render/html.ts) emits
a page (SVG classes plus `style.css` and `client.js`),
[`typst.ts`](../src/render/typst.ts) typesets paper, and
[`terminal.ts`](../src/render/terminal.ts) draws a grid of cells.
