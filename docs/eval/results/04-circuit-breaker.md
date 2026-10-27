# How a circuit breaker protects a service

When a service you depend on gets slow or starts failing, the worst thing you can do is keep
calling it at full rate. Each call ties up a thread or connection while it waits for a timeout,
your own service runs out of capacity, and the failure spreads upstream to everyone who calls
*you*. Meanwhile the struggling dependency is flooded with retries that make recovery harder.

A circuit breaker sits in front of the remote call and stops this. Like its electrical namesake,
it trips when it sees too many failures and cuts the connection, then cautiously tests whether
it is safe to reconnect.

## The cascade it prevents

```causal-loop id=cascade title="Why failures cascade without a breaker"
latency: "Dependency latency"
waiting: "Requests waiting"
exhaustion: "Thread pool exhaustion"
retries: "Client retries"
load: "Load on dependency"
breaker: "Breaker open" {role=focus}
latency -> waiting : +
waiting -> exhaustion : +
exhaustion -> latency : +
latency -> retries : +
retries -> load : +
load -> latency : +
breaker -> load : -
loop "Thread exhaustion": latency -> waiting -> exhaustion -> latency
loop "Retry storm": latency -> retries -> load -> latency
```

Both loops are reinforcing: slowness causes more slowness. An open [breaker](#cascade.breaker)
cuts the load on the dependency, which is what lets the loop unwind.

## The three states

```state-machine id=cb title="Circuit breaker states" direction=right
start -> closed
closed: "Closed" {role=happy}
open: "Open" {role=error}
half: "Half-open" {role=focus}
closed -> closed : success / failure below threshold
closed -> open : failure threshold reached
open -> half : cool-down timer expires
half -> closed : trial calls succeed {role=happy}
half -> open : trial call fails {role=error}
steps:
  closed -> open : failure threshold reached "Normal operation. Calls pass through and the breaker counts failures over a sliding window. Once the rate crosses the threshold, it trips."
  open -> half : cool-down timer expires "While open, every call fails immediately without touching the dependency. After a cool-down, the breaker lets a test through."
  half -> open : trial call fails "If the trial call fails, the dependency is still sick. Back to open, and the timer restarts."
  half -> closed : trial calls succeed "If enough trial calls succeed, the breaker closes and normal traffic resumes."
```

**[Closed](#cb.closed)** is the normal state. Every request goes through to the dependency, and
the breaker records the outcome. It doesn't trip on a single error; it watches a window, such as
"the last 100 calls" or "the last 10 seconds", and trips when the failure rate passes a threshold
(say 50%) with a minimum number of calls so that two failures out of three at 3 a.m. don't count.
Slow calls that exceed a time limit usually count as failures too, because slowness is what
exhausts threads.

**[Open](#cb.open)** is the protective state. Calls fail immediately with an error like
`CircuitOpenException`, without any network traffic. This is the point of the pattern: your
service answers in microseconds instead of waiting for a 30-second timeout, so its threads stay
free, and the dependency gets breathing room. Your code should handle the fast failure with a
**fallback**: serve a cached value, a default, a degraded page, or a clear error.

**[Half-open](#cb.half)** is the probe. After a cool-down (for example 30 seconds), the breaker
lets a small number of trial requests through. If they succeed, the dependency has recovered and
the breaker closes. If any fails, it opens again and restarts the timer. Limiting the trial to a
few calls matters: it stops a recovering service from being hit by the full load at once.

## Tuning it

The interesting decisions are the numbers:

- **Failure threshold and window.** Too sensitive and normal blips trip the breaker; too lax and
  it trips after the damage is done.
- **What counts as a failure.** Timeouts and 5xx responses, yes. A 404 or a validation error is the
  caller's fault and should not trip it.
- **Cool-down length.** Short enough to recover quickly, long enough that the dependency can.
- **Scope.** One breaker per dependency, or per endpoint, so a broken report endpoint doesn't
  block checkout.

A circuit breaker pairs naturally with timeouts (so failures are detected quickly), bulkheads
(separate thread pools per dependency) and retries with backoff (which should happen *inside* the
breaker, so retries count toward tripping it). Libraries such as Resilience4j, Polly and the
breakers built into service meshes like Istio and Envoy implement all of this.
