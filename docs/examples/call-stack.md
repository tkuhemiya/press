# How recursion unwinds

A recursive function looks like it loops, but nothing repeats in place. Each call pushes a new
frame that waits on the one above it, and the answer only appears on the way back down.

```call-stack id=fact title="factorial(3)"
f3: "factorial(3)" {note="n = 3"}
f2: "factorial(2)" {note="n = 2"}
f1: "factorial(1)" {note="n = 1", role=focus}

main -> f3
f3 -> f2
f2 -> f1
f1 --> f2 : 1
f2 --> f3 : 2
f3 --> main : 6

steps:
  main -> f3     "main asks for 3!, and its frame waits."
  f2 -> f1       "Each call pushes a frame for a smaller n. Three frames are now waiting."
  f1 --> f2      "The base case returns 1 without calling again. This is the deepest the stack gets."
  f3 --> main    "Each frame multiplies on the way back: 1, then 2, then 6."
```

The stack is deepest at [the base case](#fact.f1). Without it, frames keep pushing until the
stack overflows.

## When a call throws

An exception does not return to its caller. It unwinds every frame between the throw and the
nearest handler, and those frames end without a value.

```call-stack id=checkout title="A timeout unwinds to the handler"
handle: "handle(request)"
save: "saveOrder(cart)"
charge: "charge(card)"
fetch: "fetch(stripe)" {role=error}

handle -> save
save -> charge
charge -> fetch
fetch --> handle : Timeout {role=error}

steps:
  charge -> fetch    "The charge waits on the network."
  fetch --> handle   "The request times out. charge and saveOrder never finish; only handle catches it."
```

[saveOrder](#checkout.save) is cut off, so any work it started before the throw is left half
done. That is why the write belongs after the charge.
