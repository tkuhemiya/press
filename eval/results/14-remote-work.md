# The case for and against fully remote work

Arguments about remote work tend to talk past each other because they measure different
things. Advocates point to individual output, hiring and cost; skeptics point to learning,
trust and the slow-moving health of a team. Both sides are mostly right about what they
measure. The useful question is which effects dominate for a given team, and what it would
take to offset the costs.

## The strongest case for

**Talent without geography.** A fully remote company hires from everywhere it can legally
employ people. For specialised roles that is decisive: the best candidate is rarely within
commuting distance of one office. It also widens the pool to people who cannot relocate,
including carers and people with disabilities.

**Deep work.** Open-plan offices are interruption machines. Remote workers report, and several
studies measure, more uninterrupted time for focused tasks like coding, writing and analysis.

**Time and money.** The average commute in many cities eats an hour a day. Companies save on
real estate; employees save on travel and housing in expensive cities.

**Written culture, by necessity.** Remote teams have to write things down. Decisions,
designs and context end up in documents rather than in someone's memory of a hallway
conversation, which helps everyone who joins later.

## The strongest case against

**Weak ties wither.** Remote teams keep their strong ties, the people they work with every
day, but lose the weak ties across teams that carry new ideas and early warnings. Large
studies of company communication after the 2020 shift found exactly this: networks became
more siloed and more static.

**Juniors learn by watching.** Much of what early-career people learn comes from overhearing
how seniors handle problems. Remote work makes that learning deliberate and scheduled,
which means it happens less. Feedback gets slower, and promotions can quietly drift towards
whoever is most visible.

**Trust is slower to build.** Disagreements that would be settled over lunch become long
threads. Teams compensate with process, which has a cost of its own.

**Isolation.** For some people the office is a large part of their social life. Loneliness is
not evenly distributed, and it is hard to see from a video call.

## Side by side

```tradeoffs id=modes title="Where each arrangement wins"
remote: "Fully remote"
hybrid: "Hybrid, set days"
office: "Fully in office"
remote.hiring : "global pool" {role=happy}
remote.focus : "high" {role=happy}
remote.cost : "lowest" {role=happy}
remote.mentoring : "deliberate only" {role=error}
remote.weak_ties : "erode" {role=error}
hybrid.hiring : "commuting range"
hybrid.focus : "home days"
hybrid.cost : "office still needed" {role=error}
hybrid.mentoring : "on office days"
hybrid.weak_ties : "partly kept"
office.hiring : "commuting range" {role=error}
office.focus : "interrupted" {role=error}
office.cost : "highest" {role=error}
office.mentoring : "ambient" {role=happy}
office.weak_ties : "strong" {role=happy}
```

Hybrid looks like a compromise, but it often inherits the costs of both: the company still
pays for an office, and everyone still has to live within reach of it.

## Why the effects compound

The costs of remote work are not a fixed tax. They feed on each other, and the deciding
factor is whether a team invests to break the cycle.

```causal-loop id=trust title="Trust erosion, and what offsets it"
remote -> informal : -
informal -> trust : +
trust -> process : -
process -> informal : -
trust -> gatherings : -
gatherings -> trust : +
loop "Erosion": informal -> trust -> process -> informal
loop "Deliberate repair": trust -> gatherings -> trust
```

Less [informal contact](#trust.informal) means less [trust](#trust.trust). Low trust is
compensated with more [process](#trust.process): status meetings, approvals, check-ins. That
process eats the slack time where informal contact used to happen, so the
[erosion loop](#trust.informal) reinforces itself.

Good remote companies counter it on purpose: when trust drops, they spend money on
[gatherings](#trust.gatherings), offsites and team weeks, and on structured mentoring. That
is a balancing loop, but it only exists if someone chooses to fund it.

## Where that leaves you

Fully remote tends to win for experienced, self-directed people doing work that can be
specified in writing, especially at companies that need talent from a wide area. It tends
to lose for teams heavy with junior staff, for work that depends on fast, ambiguous
collaboration, and for organisations unwilling to pay for the deliberate rituals that
replace the office's accidents.
