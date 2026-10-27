# Authoring eval: can an agent write Press from the skill alone?

**Setup.** 20 prompts (`prompts.md`) across software, economics, science, history and
judgement calls, answered by 4 fresh agents (5 each) that could read only
`skills/press/SKILL.md`. Each saved a first draft before running `press check`, then fixed it
using only the checker's messages, and wrote notes on what it could not express. Everything
is in `results/`. A `.draft.md` is kept when the first draft differs from the final. Twelve first drafts matched the final, so `results/` keeps one copy of each. Every figure, re-rendered after the fixes below, is in `sheets/`.

## Headline

- **The language is learnable from the skill.** 16 of 20 first drafts had no errors; all 20
  were clean within two rounds. 40 diagrams across all 8 types.
- **The error messages work.** Every error an agent hit was fixed from the message alone,
  except one (a duration on a timeline), whose suggested fix pointed the wrong way.
- **The checker is not the whole story.** The problems worth fixing were ones it could not
  see: raw ids as labels, wide diagrams shrunk to unreadable, and tradeoffs categories that
  silently vanished. Only rendering showed them.

| | First-draft errors | Rounds | Types used |
|---|---|---|---|
| 01 tls-handshake | 0 | 1 | sequence |
| 02 git-rebase | 0 | 1 | architecture ×3 (as commit graphs), decision-tree |
| 03 k8s-deploy | 0 | 1 | architecture, sequence |
| 04 circuit-breaker | 0 | 1 | causal-loop, state-machine |
| 05 pick-database | 0 | 1 | tradeoffs, decision-tree |
| 06 slack-schema | 0 | 1 | er |
| 07 http-request | 0 (1 warning) | 2 | sequence |
| 08 backprop | 0 | 1 | architecture (as a compute graph) |
| 09 inflation-spiral | 0 | 1 | causal-loop |
| 10 price-ceiling | 1 | 2 | causal-loop, tradeoffs |
| 11 apollo-11 | 0 | 1 | timeline, state-machine |
| 12 photosynthesis | 0 | 1 | architecture, state-machine |
| 13 false-sharing | 4 | 2 | state-machine, sequence, tradeoffs |
| 14 remote-work | 0 | 1 | tradeoffs, causal-loop |
| 15 incident-triage | 0 | 1 | timeline, decision-tree |
| 16 oauth-pkce | 0 (2 warnings) | 2 | sequence ×2 |
| 17 thermostat | 0 | 1 | causal-loop, state-machine |
| 18 event-loop | 0 | 1 | architecture, state-machine, timeline |
| 19 raft-election | 6 | 2 | state-machine, sequence, timeline |
| 20 choose-license | 0 | 1 | decision-tree, tradeoffs |

## Fixed in this branch

| Found | Fix |
|---|---|
| Undeclared ids drawn raw: `wage_demands`, `help_now` (09, 10, 14) | An undeclared id reads as words: "wage demands". er table names stay as written. |
| Wide architectures unreadable on screen (03, 12, 18) | Without `direction`, a figure takes the direction that fits the page. |
| Cells written inside a tradeoffs `group` drew no categories, silently (05) | Such cells put their criterion in the group; empty groups now warn. |
| `0ms` on a timeline: the fix suggested treating `0` as an id (19) | A clear error that timelines take dates or clock times, with real alternatives. |
| Skill gaps every agent hit: label declarations, `direction` and `note` syntax, node steps, sequence kinds, `{delay=yes}`, tradeoffs categories, what timeline groups mean, what to do when no type fits | Added to the skill. Two agents wanted delay marks that already existed. |

## What agents wanted but could not say

| Need | Prompts | Count |
|---|---|---|
| **Phases in a sequence**: bracket messages (TLS flights, DNS/TCP/TLS/HTTP), mark "async from here", a "term 5" frame, broadcast to several | 01, 03, 07, 16, 19 | 5 |
| **A chart with axes**: supply and demand with a ceiling, temperature over time, an energy diagram | 10, 17, 12 | 3 |
| **Parallel lanes over time**: git branches, two spacecraft, per-server roles | 02, 11, 19 | 3 |
| **State snapshots / memory**: bytes in a cache line; what is on the stack and in each queue at each moment | 13, 18 | 2 |
| **Prose links to an edge or a loop**, not just a node | 09, 15 | 2 |
| Compute graph with gradients flowing backward | 08 | 1 |
| Argument map: claims, evidence, rebuttals | 14 | 1 |
| Relative durations on a timeline (`+180ms`) | 19 | 1 |
| A neutral "caveat" tone for tradeoffs cells | 05 | 1 |
| Non-software node kinds in architecture | 12 | 1 |

## Known limits not fixed here

- A causal loop with many variables and few named loops (10: 12 variables) spreads out and
  its text gets small. The loop-inflation layout helps only named loops.
- Agents rarely rendered their work; the ones that did found the most. The skill now says
  to run `press check`; it could also say to build and look.
