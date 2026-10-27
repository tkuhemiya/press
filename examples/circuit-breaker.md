# The circuit breaker pattern

When a downstream service starts failing, the worst thing a caller can do is keep
calling it. Every request waits for a timeout, threads pile up, and the failure spreads
upstream. A **circuit breaker** sits in front of the call and stops trying for a while
once failures cross a threshold.

## Three states

```state-machine id=breaker title="Circuit breaker states" direction=right
start -> closed
closed: "Closed" {note="calls pass through"}
open: "Open" {role=error, note="calls fail fast"}
half_open: "Half-open" {role=focus, note="one trial call"}

closed -> closed : success
closed -> open : failures ≥ threshold {role=error}
open -> half_open : cool-down elapsed
half_open -> closed : trial succeeds {role=happy}
half_open -> open : trial fails {role=error}

steps:
  closed                     "Normally the breaker is closed and every call goes through."
  closed -> open             "Once failures in the window cross the threshold, it trips open."
  open                       "While open, calls fail immediately: no timeouts, no piled-up threads."
  open -> half_open          "After a cool-down it lets a single trial call through."
  half_open -> open          "If the trial fails, the service is still down, so the breaker reopens."
  half_open -> closed        "If it succeeds, normal traffic resumes."
```

The state people forget is [half-open](#breaker.half_open). Without it, a breaker
would either stay [open](#breaker.open) forever or flood a recovering service with
the whole backlog at once.

## A call while the breaker is open

```sequence id=call title="Calling through an open breaker"
caller: service "Checkout"
breaker: service "Breaker"
inventory: external "Inventory API"

caller -> breaker : reserve(item)
breaker -> breaker : state is open
breaker --> caller : fail fast {role=error}
caller -> caller : use cached stock level {role=happy}

steps:
  caller -> breaker      "Checkout asks to reserve an item."
  breaker -> breaker     "The breaker is open, so it does not call Inventory at all."
  breaker -> caller      "It fails in microseconds instead of waiting for a timeout."
  caller -> caller       "Checkout falls back to a cached stock level and carries on."
```

Notice that the [Inventory API](#call.inventory) never sees the request. That silence
is the point: it gives the failing service room to recover.
