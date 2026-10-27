# 10 price-ceiling — notes

## Types used and why
- `causal-loop` (id=rent): the long-run effects of rent control (shortage, under-maintenance, less building, conversions, political lock-in) are feedbacks through landlord returns and politics.
- `tradeoffs` (id=options): comparing hard ceiling, rent stabilisation, vouchers and building more across help-now, supply effect, cost and targeting, with "build more" marked as the focus.

## Checker rounds
- Round 1: 1 error, 0 warnings.
  - `10-price-ceiling.md:58: error: 'supply' is used both as an option (left of the dot) and as a criterion (right of it). fix: Options go on the left, criteria on the right: option.criterion : value.`
  - Did the message alone tell me how to fix it? **Yes** — the clash was clear; renamed the option to `build` (and updated the prose link). The fix line is generic rather than "rename one of them", but the diagnosis made it obvious.
- Round 2: clean.

## Wanted but couldn't express
- **A supply-and-demand chart** — the most important gap. The canonical explanation is a graph: demand and supply curves, equilibrium rent, a horizontal ceiling line below it, and the shortage as the horizontal gap between quantity demanded and supplied at the ceiling (plus short-run vertical vs long-run sloped supply). Press has no chart/plot type for curves or quantitative relationships. I described the shortage in prose under "The immediate effect".
- **Short run vs long run.** I wanted to show two states of the same market side by side (fixed stock now, shrinking stock later). Neither causal-loop nor timeline expresses this; prose plus the "slow effects" diagram instead.
- **Delays on causal edges** (maintenance decline and lost construction take years). No delay marker; captions mention "over years".
- **Exogenous policy variable.** `gap` (cap below market rent) is set by policy; would like to mark it as a lever/input.
- **Dangling effects in causal-loop.** `search_costs`, `mobility` and `quality` are consequences that don't feed back; causal-loop accepted them, but they aren't loops, so this diagram mixes "consequences" with "feedback". A plain effects/consequence tree type would have fitted them better.
- **Tradeoff criterion labels and categories.** SKILL.md says "group criteria into categories" but shows no syntax for it, nor how to give a criterion a reader-facing label (`help_now` vs "Helps renters now"). I left bare ids.
- **Mixed-valence cells.** "zoning reform is cheap; public building is not" is good and bad at once; only happy/error/none available, so I left it unmarked.

## Skill gaps
- Tradeoffs: no syntax shown for criterion categories or criterion labels, despite the instruction to "group criteria into categories".
- Tradeoffs: the rule that option ids and criterion ids share a namespace isn't mentioned (the checker caught it).
- Causal-loop: whether non-loop (dangling) nodes are acceptable or discouraged isn't said.
