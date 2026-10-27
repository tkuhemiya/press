# Triaging a high-latency page

A latency page at 3 a.m. invites the wrong instinct: open a dashboard and start looking for
the root cause. The first job of the on-call engineer is not to understand the problem. It is
to find out how bad it is, stop the bleeding, and only then dig in. Diagnosis can wait;
users can't.

## The first fifteen minutes

```timeline id=phases title="Order of work"
ack: "Acknowledge"
impact: "Confirm impact" {role=focus}
mitigate: "Mitigate"
diagnose: "Diagnose"
handoff: "Hand off, write up" {role=muted}
steps:
  ack "Acknowledge within minutes so the pager stops escalating and others know someone is on it."
  impact "Decide whether real users are hurting before you spend effort on the cause."
  mitigate "Take the cheapest action that makes it stop, even if you don't yet know why it works."
  diagnose "Find the cause once users are safe, with time to be careful."
```

[Acknowledge](#phases.ack) the page first. It costs nothing, stops the escalation chain, and
tells the team someone is looking. If it's clearly big, open an incident channel straight
away and say so; it's cheaper to stand one down than to start one late.

Then [confirm impact](#phases.impact). Latency alerts are usually on a percentile (p99 over
500 ms, say) and percentiles can move for dull reasons: a low-traffic hour where a handful of
slow requests dominate, or one batch client. Look at the user-facing SLO: is the error
budget burning, are requests timing out, are other alerts firing? The answer decides
whether you're in an incident or doing a ticket.

## Narrowing it down

Once impact is real, the questions below cover most latency incidents, in the order that
gets you to a mitigation fastest.

```decision-tree id=triage title="High latency: what to do first"
hurting: "Are users actually affected?"
watch: "Ticket it, keep watching" {role=muted}
change: "Deploy, flag or config change in the last hour?"
rollback: "Roll it back" {role=happy}
scope: "One endpoint or region, or everything?"
traffic: "Traffic shift on that path?"
limit: "Rate-limit or block the source"
saturated: "CPU, memory, pools or queues saturated?"
scale: "Scale out or shed load"
dependency: "A dependency slow?"
degrade: "Fail over or degrade around it"
escalate: "Escalate and widen the incident" {role=error}
hurting -> watch : no
hurting -> change : yes
change -> rollback : yes
change -> scope : no
scope -> traffic : one path
scope -> saturated : everything
traffic -> limit : yes
traffic -> saturated : no
saturated -> scale : yes
saturated -> dependency : no
dependency -> degrade : yes
dependency -> escalate : no
steps:
  hurting -> change "Once impact is confirmed, look at what changed: most incidents follow a change."
  change -> rollback "If something shipped recently, roll it back before proving it was the cause."
  change -> scope "No recent change: scope tells you whether to look at one path or the whole system."
  saturated -> dependency "If nothing local is saturated, the time is probably being spent waiting on something else."
  dependency -> escalate "If none of this fits, get more people; don't keep searching alone."
```

The [change](#triage.change) question comes first because it is both the most likely cause
and the cheapest fix. Check the deploy log, feature-flag history and config pushes for every
service in the path, not just your own. If something changed, [roll it back](#triage.rollback)
without waiting for proof; a rollback that turns out to be unnecessary costs minutes.

Without a recent change, [scope](#triage.scope) splits the search. Latency on one endpoint or
in one region points at something specific: a new client hammering one path, a big tenant, a
cold cache after a restart. Latency everywhere points at shared resources.

For shared resources, check [saturation](#triage.saturated) using the USE method:
utilisation, saturation and errors on CPU, memory, connection pools, thread pools and
queues. A full database connection pool or a growing queue explains latency directly, and
[scaling out or shedding load](#triage.scale) buys time.

If nothing local is saturated, your service is probably waiting on a
[dependency](#triage.dependency). Distributed traces show where a slow request spends its
time; per-dependency latency dashboards confirm it. Fail over, serve stale data, or turn off
the feature that needs it.

If none of this fits, [escalate](#triage.escalate). Pull in the owners of the dependencies and
an incident commander. The worst triage pattern is a lone engineer investigating quietly for
an hour while users wait.

## After it's stable

Write a short timeline while it's fresh: when the page fired, what you saw, what you tried
and what worked. [Diagnosis](#phases.diagnose) and the write-up can then happen in daylight,
and the blameless review should ask why the alert, dashboards or rollback path didn't make
this faster.
