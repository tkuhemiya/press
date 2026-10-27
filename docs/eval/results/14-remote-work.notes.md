# 14 remote-work: notes

## Types used and why
- `tradeoffs` (modes): fully remote vs hybrid vs office on hiring, focus, cost, mentoring and weak ties; the honest answer is a comparison where each option wins different rows.
- `causal-loop` (trust): the main argument against remote work is a compounding one (less informal contact -> less trust -> more process -> even less informal contact), with a balancing loop from deliberate gatherings. A loop diagram shows why it's not a fixed tax.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first run.

## Wanted but couldn't express
- **An argument map.** The prompt is literally "arguments for and against". I wanted a pro/con structure: claims, the evidence behind each, and rebuttals linking across sides. Tradeoffs is option x criterion, which is a different shape; I wrote the arguments as prose headings and used tradeoffs only for the summary comparison.
- **No recommended option.** SKILL.md says mark the recommended option with `focus`; here there is deliberately no winner. That's fine, but I'd have liked a way to say "depends on" in a column, e.g. conditions under which each option wins.
- **Exogenous driver in the causal loop.** `remote` is a policy choice that pushes on the system but isn't part of any loop; I couldn't mark it as an external input/lever.
- **Causal-loop node labels.** I used bare ids (`informal`, `process`) because the example does; I didn't know whether `informal: "Informal contact"` declarations are allowed in causal-loop. The rendered names may be terse.
- **Linking prose to a loop.** I wanted "the erosion loop" in prose to highlight the loop; links target nodes, so I pointed it at `informal`.
- **Strength / delay on causal edges.** Trust erodes slowly (months); gatherings help quickly but briefly. Delay marks on causal edges are standard in system dynamics and would help here.

## Skill gaps
- Causal-loop: unclear whether nodes can be declared with labels, and whether steps make sense for loops.
- Tradeoffs: unclear how criteria ids are displayed and how to group them into categories; also no guidance for comparisons with no recommendation.
