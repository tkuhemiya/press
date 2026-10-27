# 09 inflation-spiral — notes

## Types used and why
- `causal-loop` (id=spiral): a wage-price spiral is literally a reinforcing feedback loop; the expectations loop (also reinforcing) and the central-bank policy loop (balancing) are best seen as competing loops on the same variables. Steps walk shock -> wages -> pass-through -> expectations -> policy.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first try.

## Wanted but couldn't express
- **Delays on causal links** — the most important gap here. The policy brake works with a 12–18 month lag, and that lag is the whole reason central banks must act early and why they overshoot into recession. System-dynamics diagrams mark delays with a `||` on the edge; Press has no attribute for it per SKILL.md. Described in prose.
- **Linking prose to a loop.** I wanted "Follow the [main loop]" to highlight the named loop. Loops have no id I know of, so I linked to the `prices` node instead, which is a slightly misleading link.
- **Distinguishing a policy lever from endogenous variables.** `policy_rate` is something the central bank chooses (partly reacting to prices); I'd like to mark it as a control/lever. Used no role, prose only.
- **Strength of a link** (partial vs full pass-through/indexation decides whether the spiral grows or fades). Polarity is binary; strength lives in prose.
- **A historical timeline** (1970s spiral, Volcker 1979–82, 2021–23) would have been nice but would be a second diagram for a side point; skipped.
- Node labels: I used ids like `wage_demands` and did not give labels; SKILL.md's causal-loop example also uses bare ids, so I assume ids are prettified. Not sure.

## Skill gaps
- Whether causal-loop nodes take labels (`prices: "Price level"`) and whether ids are humanised isn't stated.
- Whether loops can be referenced from prose or steps isn't stated.
- `steps:` for causal-loop isn't shown; I assumed the shared `a -> b "caption"` form and it passed.
