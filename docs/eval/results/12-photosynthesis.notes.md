# 12 photosynthesis: notes

## Types used and why
- `architecture` (chloro): the two machines (thylakoid light reactions, stroma Calvin cycle) are standing parts with fixed connections, and edge labels say what travels (electrons, protons, ATP, NADPH, CO2). Groups are the two compartments.
- `state-machine` (calvin): carbon moves through a cycle of molecular forms (RuBP -> 3-PGA -> G3P -> back to RuBP, plus one exported G3P); transitions are the reactions.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first run.

## Wanted but couldn't express
- **Non-software node kinds.** Architecture kinds are `client/service/database/queue/cache/storage/external/user`. Photosystems became `service`, sunlight/water/CO2 became `external`, sugar became `storage`. The semantics are wrong-ish and the icons/shapes (if any) will suggest servers and databases. I wanted a generic process/material-flow diagram (stages, inputs, outputs, compartments) or a kind like `process` / `substance`.
- **The Z-scheme energy diagram.** The classic picture of the light reactions plots electron energy against position in the chain (two uphill jumps from photons, downhill in between). That needs an axis/plot; Press has no chart or energy-level type. Described in prose.
- **Quantities on edges (stoichiometry).** "3 CO2 in, 6 ATP + 6 NADPH spent, 1 G3P out" is the crux of the Calvin cycle. I could only put numbers inside labels; no way to show balanced inputs/outputs per turn.
- **A cycle without a start.** The Calvin cycle has no real beginning; state-machine wants `start ->`. I added `start -> rubp`, which implies an entry point that doesn't exist biologically.
- **Recycled currency loop.** ADP/NADP+ returning to the thylakoid I drew as dashed edges; fine, but it adds clutter. A way to say "these two edges are one exchange" would help.

## Skill gaps
- Kind is described as optional in the grammar, but the architecture section lists only software kinds, so it's unclear whether a kindless node in architecture is OK or what it looks like. I used kinds everywhere to be safe.
- `direction=right` in the fence header passed the checker, but SKILL.md never shows where `direction` goes or what its values are; I guessed.
- No guidance on using Unicode subscripts (CO₂) in labels; it passed, but I don't know if it's preferred.
