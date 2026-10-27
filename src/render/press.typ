// Press print template. Reads the document Press exports as JSON and typesets it.
// Diagram marks arrive fully resolved (positions in px, colours, stroke widths), so this
// file only draws them; the page and prose design live here, as style.css does for HTML.

#let doc = json(sys.inputs.at("data", default: "doc.json"))

#let ink = rgb("#22211e")
#let ink2 = rgb("#54514a")
#let ink3 = rgb("#8a867c")
#let rule = rgb("#e6e2d8")
#let sans = "Inter"
#let serif = "Source Serif 4"
#let mono = "JetBrains Mono"

#set document(title: doc.at("title", default: "Press"))
#set page(paper: "a4", margin: (top: 18mm, x: 17mm, bottom: 20mm), numbering: "1")
#set text(font: serif, size: 10.5pt, fill: ink, lang: "en", hyphenate: true)
#set par(leading: 0.7em, spacing: 0.95em, justify: true)
#set strong(delta: 200)
#show raw: set text(font: mono, size: 8.5pt)
#show heading: set text(font: sans, fill: ink)
#show heading: set block(sticky: true)
#show heading.where(level: 1): it => block(below: 0.9em, text(size: 20pt, weight: 600, tracking: -0.02em, it.body))
#show heading.where(level: 2): it => block(above: 1.7em, below: 0.75em, text(size: 13.5pt, weight: 600, tracking: -0.01em, it.body))
#show heading.where(level: 3): it => block(above: 1.4em, below: 0.6em, text(size: 11pt, weight: 600, it.body))

// Diagram marks

#let stroke-of(m, s) = {
  if m.at("stroke", default: none) == none { return none }
  (
    paint: rgb(m.stroke),
    thickness: m.sw * s,
    cap: m.at("cap", default: "butt"),
    join: "round",
    dash: if "dash" in m { m.dash.map(d => d * s) } else { none },
  )
}

#let fill-of(m) = if m.at("fill", default: none) == none { none } else { rgb(m.fill) }

#let hatch(colour, s) = {
  let side = 6 * calc.sqrt(2) * s
  let pen = (paint: rgb(colour).transparentize(68%), thickness: 1.4 * s)
  tiling(size: (side, side), {
    place(line(start: (0pt, side), end: (side, 0pt), stroke: pen))
    place(line(start: (-side / 2, side / 2), end: (side / 2, -side / 2), stroke: pen))
    place(line(start: (side / 2, side * 1.5), end: (side * 1.5, side / 2), stroke: pen))
  })
}

#let segment(seg, s) = {
  let pt(i) = (seg.at(i) * s, seg.at(i + 1) * s)
  let op = seg.at(0)
  if op == "M" { curve.move(pt(1)) }
  else if op == "L" { curve.line(pt(1)) }
  else if op == "C" { curve.cubic(pt(1), pt(3), pt(5)) }
  else if op == "Q" { curve.quad(pt(1), pt(3)) }
  else { curve.close() }
}

#let label(m, s) = for (i, line) in m.lines.enumerate() {
  let body = text(
    font: sans,
    size: m.size * s,
    weight: m.weight,
    fill: rgb(m.fill),
    style: if m.at("italic", default: false) { "italic" } else { "normal" },
    tracking: m.at("tracking", default: 0) * 1em,
    top-edge: "baseline",
    bottom-edge: "baseline",
    if m.at("upper", default: false) { upper(line) } else { line },
  )
  context {
    let shift = if m.anchor == "middle" { measure(body).width / 2 } else { 0pt }
    place(dx: m.x * s - shift, dy: (m.y + i * m.lh) * s, body)
  }
}

#let mark(m, s) = {
  if m.k == "rect" {
    let fill = if "hatch" in m { hatch(m.hatch, s) } else { fill-of(m) }
    place(dx: m.x * s, dy: m.y * s, rect(width: m.w * s, height: m.h * s, radius: m.r * s, fill: fill, stroke: stroke-of(m, s)))
  } else if m.k == "circle" {
    place(dx: (m.cx - m.r) * s, dy: (m.cy - m.r) * s, circle(radius: m.r * s, fill: fill-of(m), stroke: stroke-of(m, s)))
  } else if m.k == "ellipse" {
    place(dx: (m.cx - m.rx) * s, dy: (m.cy - m.ry) * s, ellipse(width: m.rx * 2 * s, height: m.ry * 2 * s, fill: fill-of(m), stroke: stroke-of(m, s)))
  } else if m.k == "path" {
    place(curve(fill: fill-of(m), stroke: stroke-of(m, s), ..m.segs.map(seg => segment(seg, s))))
  } else {
    label(m, s)
  }
}

#let drawing(scene, s) = box(width: scene.width * s, height: scene.height * s, {
  for m in scene.marks { mark(m, s) }
})

// Prose

#let inl(xs) = xs.map(x => {
  if x.t == "text" { x.s }
  else if x.t == "strong" { strong(inl(x.c)) }
  else if x.t == "em" { emph(inl(x.c)) }
  else if x.t == "code" { raw(x.s) }
  else if x.t == "link" { link(x.href, inl(x.c)) }
  else if x.t == "ref" { [#inl(x.c)#h(0.1em)#super(typographic: false, text(font: sans, weight: 600, style: "italic", fill: ink, x.marker))] }
  else { linebreak() }
}).join()

#let legend(steps) = {
  set text(font: sans, size: 8.5pt, fill: ink2)
  set par(justify: false, leading: 0.45em, spacing: 0.55em)
  for (i, c) in steps.enumerate() {
    grid(
      columns: (12pt, 1fr),
      column-gutter: 6pt,
      box(baseline: 2.6pt, circle(radius: 6pt, fill: ink, inset: 0pt, align(center + horizon,
        text(fill: white, size: 7pt, weight: 600, str(i + 1))))),
      inl(c),
    )
  }
}

#let figure-block(f) = block(breakable: false, width: 100%, above: 1.3em, below: 1.4em, {
  if "title" in f { block(below: 6pt, text(font: sans, size: 9pt, weight: 600, fill: ink2, f.title)) }
  let native = "scene" in f
  let art = if native {
    drawing(f.scene, doc.scale * f.fit * 1pt)
  } else {
    block(width: 100%, inset: 10pt, stroke: (paint: rule, dash: "dashed"),
      text(font: sans, size: 8.5pt, fill: ink3)[A #f.kind diagram. Press cannot draw this type natively in print yet.])
  }
  if f.steps.len() == 0 { align(center, art) }
  else if f.beside and native { grid(columns: (auto, 1fr), column-gutter: 18pt, align: horizon, art, legend(f.steps)) }
  else { align(center, art); v(8pt); columns(2, gutter: 18pt, legend(f.steps)) }
})

#let blocks(bs) = for b in bs {
  if b.t == "heading" { heading(level: b.level, inl(b.c)) }
  else if b.t == "para" { par(inl(b.c)) }
  else if b.t == "list" {
    let items = b.items.map(item => blocks(item))
    if b.ordered { enum(..items) } else { list(..items) }
  }
  else if b.t == "code" { block(width: 100%, inset: 8pt, radius: 4pt, fill: rgb("#f5f3ed"), raw(b.s, lang: b.lang, block: true)) }
  else if b.t == "quote" { quote(block: true, blocks(b.b)) }
  else if b.t == "rule" { line(length: 100%, stroke: 0.6pt + rule) }
  else if b.t == "table" {
    set text(font: sans, size: 8.5pt)
    set par(justify: false)
    table(
      columns: b.head.len(),
      stroke: (x, y) => (bottom: if y == 0 { 0.8pt + ink2 } else { 0.5pt + rule }),
      inset: (x: 5pt, y: 4pt),
      ..b.head.map(c => strong(inl(c))),
      ..b.rows.map(r => r.map(c => inl(c))).flatten(),
    )
  }
  else if b.t == "figure" { figure-block(b) }
}

#blocks(doc.blocks)
