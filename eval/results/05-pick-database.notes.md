# 05 pick-database: notes

## Types used and why
- `tradeoffs` (dbs): three options across eight criteria in three categories, with Postgres as the recommendation (`focus`) and cells marked happy/error where they decide the matter.
- `decision-tree` (pick): "when the others win" is a few yes/no questions, with Postgres as the default outcome.

## Checker rounds
- Round 1 (first draft copy): 0 errors, 0 warnings.
- Rendering showed criteria labelled by their raw ids ("adhoc", "lockin", "tx"). The skill doesn't say how to label a criterion. I probed `adhoc: "Ad-hoc queries"` in a scratch file; the checker accepted it and it rendered as the row label.
- Round 2: I added those declarations at the top of the fence. 0 errors, 0 warnings, **but the category groups silently disappeared** from the render (no "Correctness", "Operations" headings). Declaring a criterion outside a group apparently pins it to no group, overriding the cells' group. No warning.
- Round 3: moved each criterion declaration inside its `group`. 0 errors, 0 warnings, and the render is correct.
- Message usefulness: N/A. Both problems were silent; only rendering revealed them.

## Wanted but couldn't express
- **"It depends" / conditional recommendation.** The real answer is "Postgres, unless X". Tradeoffs allows one `focus` option; I paired it with a decision tree, which works well. Nothing missing there, but a way to link a tradeoffs cell to the tree question that it drives would be nice.
- **Neutral-but-notable cells.** Many cells are neither good nor bad, just different ("documents"). Only happy/error exist; a "caveat"/warning tone (e.g. Mongo's "multi-doc since 4.0", Dynamo's "limited, 100 items") would be more honest than leaving them unmarked or calling them errors.
- **Criterion weight / importance** (ad-hoc queries matter most for a young SaaS). No way to say a criterion matters more; I said it in prose.
- **Cost** as a criterion: wanted a small numeric comparison of cost vs. traffic (Dynamo flat per request vs. fixed instance). No chart type; dropped it.

## Skill gaps
- How to give a criterion a readable label isn't documented (the example's ids `cost`, `revoke` show as-is).
- "group criteria into categories" with no syntax example. I guessed `group "Name" { cells }`, which worked.
- The interaction between top-level criterion declarations and groups (a declaration outside the group removes the grouping silently) is a trap, and the checker doesn't warn.
