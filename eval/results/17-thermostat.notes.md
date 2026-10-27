# 17 thermostat notes

## Types used and why
- `causal-loop` (loop): the explanation is a balancing feedback loop with a delay stage; edges are polarities.
- `state-machine` (modes): on/off control with hysteresis thresholds is naturally states and transitions; the "coasting" state carries the overshoot.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first draft.

## Wanted but couldn't express
- **A temperature-over-time chart.** The single most natural picture for "why it overshoots" is a line of room temperature oscillating around the set point, with the dead band shaded and the overshoot peaks marked beyond the upper threshold. Press has no plot/chart type. Timeline is for discrete events, not a continuous quantity. I described the wave in prose instead.
- **Delay on a causal link.** System-dynamics diagrams mark delayed links with a double hash ("||"). The delay is *the* cause of overshoot; I wanted `heat -> temp : + {delay=yes}`. I had to add an extra node ("Heat in the radiator") to stand in for the delay, which is close to the "don't add nodes to fight the layout" rule, though here it's a real physical stock.
- **Exogenous input.** The set point is an external input, not part of the loop; I'd have liked to mark it as such (a role like `muted` might do, but that means "context", not "input").
- I wasn't sure the checker would verify that my named loop "Correction" is balancing (one `-`), so I can't be sure the R/B label matches my prose without rendering.

## Skill gaps
- SKILL.md doesn't say whether causal-loop nodes can have labels (`gap: "Temperature gap"`); I guessed from the shared grammar and it was accepted.
- Not stated whether steps work in causal-loop or decision-tree; it accepted them.
- Self-loop transition in state-machine (`idle -> idle`) — accepted, but whether it's rendered well is unknown.
