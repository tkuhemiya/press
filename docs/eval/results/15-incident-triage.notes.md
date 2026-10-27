# 15 incident-triage: notes

## Types used and why
- `timeline` without times (phases): the order of work (acknowledge, confirm impact, mitigate, diagnose, hand off) is a sequence of stages, and SKILL.md says an untimed timeline is for exactly that.
- `decision-tree` (triage): triage is a series of questions (users affected? recent change? scope? saturation? dependency?) leading to a first action; branches rejoin (`traffic -> saturated`).

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first run.

## Wanted but couldn't express
- **"How to check" on each question.** Each decision node has a concrete check (deploy log, SLO dashboard, USE metrics, traces). I wanted a small annotation under each question. SKILL.md mentions `note` "for a short qualifier under a label" but never shows its syntax, so I didn't risk it and put the checks in prose.
- **Loops in triage.** Real triage loops: if a mitigation doesn't work, you go back and re-ask. Decision trees forbid loops (correctly for a tree), and a state-machine would lose the question/answer framing. I left it out.
- **Parallel tracks.** Communication (incident channel, status page, stakeholder updates) runs alongside the technical work. I wanted two lanes in the phases diagram; an untimed timeline is a single line.
- **Overlapping phases.** Mitigate and diagnose overlap in practice; an untimed timeline can't express spans, only evenly spaced stages.

## Skill gaps
- `note` is named but has no syntax.
- Node-only step syntax (for timeline) isn't shown; `ack "caption"` worked as a guess.
- Not stated whether decision-tree outcomes should carry roles beyond `happy`; I used `muted` and `error` and it passed.
