# Anatomy of an outage

Most outages are short. What makes them expensive is the gap between something breaking
and someone noticing, and the gap between noticing and acting. This page lays out one
afternoon's incident on a clock, so those gaps are visible.

## The afternoon of 14 March

```timeline id=incident title="Outage, 14 March"
14:02 deploy: "v2.3 rolls out"
14:09 alerts: "Error rate hits 8%" {role=error}
14:12 freeze: "Deploys frozen" {until=14:40, role=muted}
14:15 rollback: "Rollback starts"
14:21 recovered: "Errors back to baseline" {role=happy}
14:40 review: "Freeze lifted"

group "Impact window" {
  alerts
  rollback
  recovered
}

deploy -> alerts : caused

steps:
  deploy              "A routine deploy goes out. Nothing looks wrong yet."
  deploy -> alerts    "Seven minutes later the error rate crosses the alert threshold."
  rollback            "The on-call engineer rolls back instead of debugging live."
  recovered           "Six minutes after that, errors are back to normal."
```

The seven minutes between [the deploy](#incident.deploy) and [the alert](#incident.alerts)
are the detection gap; the alert threshold sets its length. The [rollback](#incident.rollback)
started three minutes after the alert, which is fast because rolling back needed no
diagnosis. The [freeze](#incident.freeze) outlasted the impact on purpose: nobody deploys
again until the cause is understood.

## How the fix rolled out

Undated timelines keep only the order, which is enough for a sequence of stages.

```timeline id=fix title="The fix" direction=down
repro: "Reproduce the bug in staging"
test: "Add a failing test"
patch: "Patch the retry logic" {note="one line"}
canary: "Ship to 5% of traffic" {role=focus}
full: "Ship to everyone" {role=happy}

repro -> test
```

The [canary](#fix.canary) is the step that would have caught the original bug.
