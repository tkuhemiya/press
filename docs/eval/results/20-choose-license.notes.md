# 20 choose-license notes

## Types used and why
- `decision-tree` (pick): the question is literally "which one should I choose", answered by a few questions about goals.
- `tradeoffs` (compare): the five common licenses compared on adoption, obligations and protection.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first draft.

## Wanted but couldn't express
- **A spectrum.** Licenses sit on a one-dimensional axis from permissive to strong copyleft, and the most useful picture is that line with each license placed on it (and the families as ranges). No type expresses an ordered scale/axis with positioned items. I used bullet prose for the three families.
- **Compatibility relation.** "Apache-2.0 can be combined into GPL-3.0 but not GPL-2.0" is a directed graph between licenses. Architecture edges would mean "connections in a system" and decision-tree would mean answers, so neither fit; I left it in prose.
- **Neutral vs. bad in tradeoffs.** Some cells are tradeoffs, not failures ("whole program" is a feature to a GPL author). Only `happy`/`error` exist; I marked it `error` from the adopting-library-author viewpoint, which bakes in a stance.
- **Criterion labels.** Criteria are ids (`closed`, `familiar`, `share`); I saw no way to give a criterion a reader-facing label like "Use in closed-source products" unless declaring it like a node works, which SKILL.md doesn't say.

## Skill gaps
- "Group criteria into categories" — SKILL.md doesn't show the syntax. I wrapped cells in `group "Name" { ... }` and the checker accepted it, but I can't tell if that is the intended form.
- How criterion ids get their displayed names is not covered.
- Decision-tree: whether a rejoin to an earlier *question* (my `changes -> patents : no`) is fine; "branches may rejoin" suggests yes and it passed.
