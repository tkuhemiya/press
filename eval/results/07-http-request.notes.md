# 07 http-request — notes

## Types used and why
- `sequence` (id=req): the story is who sends what to whom, in order (browser, DNS resolver, CDN edge, origin), with steps for DNS, TCP, TLS, request, cache miss, subresources.

## Checker rounds
- Round 1: 0 errors, 1 warning.
  - `07-http-request.md:8: warning: Unknown kind 'client' for sequence; it will draw as a plain box. fix: Known kinds: user, service, database, queue, external.`
  - Did the message alone tell me how to fix it? **Yes** — changed `client` to `user`.
- Round 2: clean.

## Wanted but couldn't express
- **Phases / brackets in a sequence.** I wanted to bracket messages into "DNS", "TCP handshake", "TLS handshake", "HTTP" phases (like UML combined fragments or a labelled span along the side). No such construct in SKILL.md; I relied on step captions and prose headings.
- **Optional / conditional messages.** The CDN -> origin hop only happens on a cache miss. Wanted an `alt`/`opt` block ("if cache miss"); I put "(cache miss)" in the label.
- **The rendering pipeline** (HTML -> DOM, CSSOM, render tree, layout, paint, composite). It is a dataflow/pipeline inside the browser, not messages between participants. Could have been an architecture or untimed timeline, but neither fits well (it's a pipeline of transformations); I left it as prose to keep one idea per diagram.
- **Latency / round-trip cost.** The point that each handshake costs a round trip would be best shown as time on the vertical axis (a waterfall). Sequence has order but no durations; timeline has durations but not participants.
- **Recursive DNS resolution** (resolver -> root -> TLD -> authoritative) would have bloated the diagram; folded into the first step caption.

## Skill gaps
- The kinds list for sequence isn't given; the architecture kinds list includes `client`, which I assumed carried over. The checker caught it, but SKILL.md's sequence section could list the sequence kinds.
- The step syntax for selecting one of several same-pair messages (`a -> b : label "caption"`) was well documented and worked.
- Unclear whether a step caption may be long (mine are one to two sentences); no warning came, so presumably fine.
