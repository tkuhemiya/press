# 13 false-sharing: notes

## Types used and why
- `state-machine` (mesi): the root cause is a cache line's coherence state flipping between Modified and Invalid; a MESI state machine for one line shows why every write by the other core is a miss.
- `sequence` (pingpong): the cost is a back-and-forth of ownership requests and invalidations between cores, in order: exactly "who sends what to whom".
- `tradeoffs` (fixes): four ways to avoid it (padding, local accumulation, regrouping by writer, a shared atomic as the non-fix) compared on speed, memory, effort, portability.

## Checker rounds
- Round 1: 4 errors, all of the same kind:
  - `13-false-sharing.md:54: error: Step c0 -> fabric is ambiguous: 2 edges join these nodes. fix: Name the edge by its label: c0 -> fabric : request ownership "…", c0 -> fabric : dirty line "…"` (same for lines 55, 56, 57).
  - Message alone told me how to fix it: **yes**, it even listed the candidate labels. I had not expected a `-->` reply and a `->` request between the same pair to collide; the step for `c0 --> fabric` was also flagged, so the arrow style doesn't disambiguate.
- Round 2: 0 errors, 0 warnings.

## Wanted but couldn't express
- **A memory layout diagram.** The single most explanatory picture for false sharing is a row of bytes: a 64-byte cache line with `a` at offset 0 and `b` at offset 8, both inside the line; then the padded version with `a` and `b` on separate lines. Press has no memory/byte-layout or "record layout" type (er is about tables and references, not offsets). I described it in prose only. This is the biggest gap in this document.
- **Numbers.** A small bar chart of throughput vs. thread count (unpadded falls, padded scales) would make the effect undeniable. No chart type.
- **Parallel activity in a sequence.** Both cores write concurrently; the sequence forces a strict order. Fine for the explanation, but a "loop/repeat" frame (this exchange repeats on every increment) would be more accurate. I said so in prose.
- **Tradeoffs criterion labels and categories.** I used ids like `portability`; I couldn't find how to give a criterion a display label, or how to "group criteria into categories" as SKILL.md recommends.
- **A "this is not a fix" marker.** The shared atomic is a contrast option, not a real candidate; I could only mark its bad cell `error`.

## Skill gaps
- The sequence section says a step picks a message by label "when the same two participants exchange several messages"; it should say that direction and arrow style (`->` vs `-->`) don't count, i.e. any two edges between the same pair need a label in the step.
- "Group criteria into categories" (tradeoffs) has no syntax example.
- No syntax for criterion display names in tradeoffs.
