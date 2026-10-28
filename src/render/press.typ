// Press print template. Reads the document Press exports as JSON and typesets it.
// Diagram marks arrive fully resolved (positions in px, colours, stroke widths), so this
// file only draws them; the page and prose design live here, as style.css does for HTML.

#let doc = json(sys.inputs.at("data", default: "doc.json"))
#let choices = json(bytes(sys.inputs.at("choices", default: "{}")))
#let chosen(key) = choices.at(key, default: 0)

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

#let text-mark(m, s) = for (i, line) in m.lines.enumerate() {
  let plain = text(
    font: sans,
    size: m.size * s,
    weight: m.weight,
    fill: rgb(m.fill),
    style: if m.at("italic", default: false) { "italic" } else { "normal" },
    tracking: m.at("tracking", default: 0) * 1em,
    number-width: if m.at("tabular", default: false) { "tabular" } else { auto },
    top-edge: "baseline",
    bottom-edge: "baseline",
    if m.at("upper", default: false) { upper(line) } else { line },
  )
  let body = if m.at("underline", default: false) { underline(offset: 2 * s, plain) } else { plain }
  context {
    let w = measure(body).width
    let shift = if m.anchor == "middle" { w / 2 } else if m.anchor == "end" { w } else { 0pt }
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
  } else if m.k == "image" {
    place(dx: m.x * s, dy: m.y * s, image(bytes(m.svg), format: "svg", width: m.w * s, height: m.h * s))
  } else if m.k == "path" {
    place(curve(fill: fill-of(m), stroke: stroke-of(m, s), ..m.segs.map(seg => segment(seg, s))))
  } else {
    text-mark(m, s)
  }
}

#let drawing(scene, s) = box(width: scene.width * s, height: scene.height * s, {
  for m in scene.marks { mark(m, s) }
})

// Prose

#let soft(s) = s.replace(regex("\\S{20}"), m => m.text + "\u{200B}")

#let inl(xs) = xs.map(x => {
  if x.t == "text" { soft(x.s) }
  else if x.t == "strong" { strong(inl(x.c)) }
  else if x.t == "em" { emph(inl(x.c)) }
  else if x.t == "code" { raw(x.s) }
  else if x.t == "link" { link(x.href, inl(x.c)) }
  else if x.t == "ref" { [#inl(x.c)#h(0.1em)#super(typographic: false, text(font: sans, weight: 600, style: "italic", fill: ink, x.marker))] }
  else { linebreak() }
}).join()

#let legend(steps, from: 0) = {
  set text(font: sans, size: 8.5pt, fill: ink2)
  set par(justify: false, leading: 0.45em, spacing: 0.55em)
  for (i, c) in steps.enumerate() {
    grid(
      columns: (12pt, 1fr),
      column-gutter: 6pt,
      box(baseline: 2.6pt, circle(radius: 6pt, fill: ink, inset: 0pt, align(center + horizon,
        text(fill: white, size: 7pt, weight: 600, str(from + i + 1))))),
      inl(c),
    )
  }
}

// Layout. Each figure has variants (its directions) and may be drawn at k times its size.
// Candidates go from the largest drawing scale down to 60% of the preferred variant's.

// A zero-height marker before each decision: its position stays put even when the
// content chosen after it moves to the next page. It also carries the space above that
// content, since spacing inside a context block does not reach outside it.
#let anchor(key, gap) = [#block(height: 0pt, above: gap, below: 0pt, width: 100%)[]#label(key)]
#let room-at(key) = page.height - page.margin.bottom - locate(label(key)).position().y
#let full-h() = page.height - page.margin.top - page.margin.bottom
#let content-w = 210mm - 2 * 17mm
#let key-of(f) = "pm-" + f.key

// What a decision saw: its room and each candidate's height, in pt. Press settles the choices
// from these reports and passes them back in, so no decision is taken inside Typst.
#let report(key, heights, title: "") = {
  let data = (
    key: key,
    room: room-at(key) / 1pt,
    heights: heights.map(h => h / 1pt),
    full: full-h() / 1pt,
    title: title,
  )
  place([#metadata(data) <press-fit>])
}

#let figure-block(f, i: 0, k: 1.0) = {
  let variant = f.variants.at(i)
  block(breakable: false, width: 100%, above: 1.3em, below: 1.4em, {
    if "title" in f { block(below: 6pt, text(font: sans, size: 9pt, weight: 600, fill: ink2, soft(f.title))) }
    let art = drawing(variant.scene, doc.scale * variant.fit * k * 1pt)
    if f.steps.len() == 0 { align(center, art) }
    else if variant.beside { grid(columns: (auto, 1fr), column-gutter: 18pt, align: horizon, art, legend(f.steps)) }
    else {
      let half = calc.ceil(f.steps.len() / 2)
      align(center, art)
      v(8pt)
      grid(columns: (1fr, 1fr), column-gutter: 18pt, legend(f.steps.slice(0, half)), legend(f.steps.slice(half), from: half))
    }
  })
}

#let candidates(f) = {
  let base = f.variants.first().fit
  let out = ()
  for (i, v) in f.variants.enumerate() {
    for k in (1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6) {
      if v.fit * k >= 0.6 * base { out.push((i: i, k: k, scale: v.fit * k)) }
    }
  }
  out.sorted(key: c => (-c.scale, c.i))
}


#let blocks(bs, fig) = for b in bs {
  if b.t == "heading" { heading(level: b.level, inl(b.c)) }
  else if b.t == "para" { par(inl(b.c)) }
  else if b.t == "list" {
    let items = b.items.map(item => blocks(item, fig))
    if b.ordered { enum(..items) } else { list(..items) }
  }
  else if b.t == "code" { block(width: 100%, inset: 8pt, radius: 4pt, fill: rgb("#f5f3ed"), raw(b.s, lang: b.lang, block: true)) }
  else if b.t == "quote" { quote(block: true, blocks(b.b, fig)) }
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
  else if b.t == "figure" { fig(b) }
}

#let one(b, fig) = blocks((b,), fig)

// A heading placed directly before a figure travels with it, in one unbreakable block.
#let lead-with(lead, body) = if lead == none { body } else { block(breakable: false, width: 100%, { one(lead, none); body }) }
#let unit-of(f, c, lead) = lead-with(lead, figure-block(f, i: c.i, k: c.k))

// Reports every candidate's height; Press chooses one (settle.ts) and sends it back in.
#let fig-place(f, key, lead: none) = context {
  let cs = candidates(f)
  report(key, cs.map(c => measure(unit-of(f, c, lead), width: content-w).height))
  unit-of(f, cs.at(calc.min(chosen(key), cs.len() - 1)), lead)
}

#let fig-flow(f, lead: none) = {
  anchor(key-of(f), if lead == none { 1.3em } else { 1.7em })
  fig-place(f, key-of(f), lead: lead)
}

#let section-head(s, fig) = if s.at("heading", default: none) != none { one(s.heading, fig) }

#let flow-section(s) = {
  let lead = s.at("heading", default: none)
  if lead != none and s.blocks.len() > 0 and s.blocks.first().t == "figure" {
    fig-flow(s.blocks.first(), lead: lead)
    blocks(s.blocks.slice(1), fig-flow)
  } else {
    section-head(s, fig-flow)
    blocks(s.blocks, fig-flow)
  }
}

// A keep section's choice is its level (0-7) kept in place, or 8 + level after a page break.
#let keep-section(s, i) = {
  let key = "pm-sec-" + str(i)
  let unit(level) = block(breakable: false, width: 100%, {
    let fig = f => {
      let cs = candidates(f)
      let c = cs.at(calc.min(level, cs.len() - 1))
      figure-block(f, i: c.i, k: c.k)
    }
    section-head(s, fig)
    blocks(s.blocks, fig)
  })
  anchor(key, if s.at("heading", default: none) == none { 0.95em } else { 1.7em })
  context {
    let heights = range(8).map(c => measure(unit(c), width: content-w).height)
    report(key, heights, title: s.at("title", default: ""))
    let pick = chosen(key)
    if pick >= 8 { pagebreak(weak: true) }
    if heights.at(calc.rem(pick, 8)) > full-h() { flow-section(s) }
    else { unit(calc.rem(pick, 8)) }
  }
}

#for (i, s) in doc.sections.enumerate() {
  if s.fresh { pagebreak(weak: true) }
  if s.keep { keep-section(s, i) }
  else { flow-section(s) }
}
