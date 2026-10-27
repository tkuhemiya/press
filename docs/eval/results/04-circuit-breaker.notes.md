# 04 circuit-breaker: notes

## Types used and why
- `causal-loop` (cascade): *why* a breaker is needed: two reinforcing loops (thread exhaustion, retry storm), and the breaker as a negative link that cuts load.
- `state-machine` (cb), `direction=right`: closed / open / half-open and what moves between them. That is the core of the topic. Four steps.

## Checker rounds
- Round 1 (first draft copy): 0 errors, 0 warnings.
- Rendering showed that causal-loop nodes I had not declared showed their raw ids ("latency", "exhaustion"). I added declarations like `latency: "Dependency latency"` (I guessed the syntax works in causal-loop; it did). Round 2: 0 errors, 0 warnings.
- The checker said nothing about undeclared, id-only labels, so there was no message to judge.

## Wanted but couldn't express
- **Guard/counter on a transition** (e.g. "failures >= 50% of last 100 calls", "N trial calls"): I put a short phrase in the edge label and the detail in prose. A `note` on an edge, or a guard syntax, would help. (I didn't try `{note=}` on an edge.)
- **The breaker as an intervention that *breaks* a loop** in the causal diagram. Causal-loop only has polarity edges; I modelled it as `breaker -> load : -`, which is an approximation. A way to show "this cuts the link latency -> retries" isn't there.
- **The request path through the breaker** (caller -> breaker -> dependency, with fallback). A small architecture or sequence would show where the breaker sits, but it would be a third diagram for a small point. Prose instead.
- A self-loop `closed -> closed : success / failure below threshold` is allowed, but I couldn't mark it as "the normal, uneventful case" other than leaving it unstyled.

## Skill gaps
- The causal-loop example has no declarations, so it implies ids *are* the labels. Should say "declare `id: \"Label\"` to give a variable a readable name".
- Not stated whether roles apply to causal-loop nodes (I used `role=focus` on the breaker; accepted).
- Where `direction=` goes is only implied by "Only `direction` is a layout hint". I put it on the fence line next to `title=`, which worked, but the skill never shows it.
