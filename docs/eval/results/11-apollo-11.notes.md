# 11 apollo-11: notes

## Types used and why
- `timeline` (mission): the mission is fundamentally events in time; real UTC timestamps, a span for the EVA, and a group band for the surface stay.
- `state-machine` (config): the spacecraft moved between physical configurations (stack, CSM+LM, apart, CSM alone, CM alone), and each transition (docking, undocking, jettison) was a risky event. Edges-as-transitions fit that exactly.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first run.

## Wanted but couldn't express
- **Parallel lanes per vehicle.** While Eagle was on the surface, Columbia was orbiting with Collins. I wanted two lanes (Columbia / Eagle) on the timeline, splitting at undock and merging at redock. Groups give a band, not lanes, so I used one band ("Eagle on the Moon") and said the rest in prose.
- **Uneven time density.** The mission is eight days, but most of the interesting events cluster within ~30 hours around the landing. I wanted a broken axis or a zoomed inset of 20-21 July. I could not tell whether Press does this; I just kept the full time scale.
- **The landing itself (1202 alarms, manual takeover, ~25 s of fuel).** That is a sub-story with its own minute-scale timeline; mixing `HH:MM` with full dates in one timeline is disallowed ("one kind of time throughout"), and a second minute-level timeline felt like too much. Left it in prose.
- **Risk / "no fallback" annotations.** I wanted to mark the rendezvous as a single point of failure. The only way was a counterfactual edge `apart -> end : no redock {role=error}`, which shows a transition that never happened. An annotation like "no fallback" on an edge would be more honest.
- **Linking prose to an edge.** I wanted `[rendezvous](...)` to highlight the `apart -> csm_lm` transition, but links target nodes, so it points at the `csm_lm` state.
- **What each configuration physically contains** (which modules are attached) would ideally be drawn, not just named. Labels like "CSM + LM + S-IVB" stand in.

## Skill gaps
- Step syntax for a node rather than an edge (needed for timeline) isn't shown; I guessed `launch "caption"` and it worked.
- Unclear whether timeline groups are allowed to contain timed events and whether that is the intended "band"; it checked clean but I couldn't verify rendering.
- No guidance on how many events a timeline should have, or on long time ranges with clustered events.
