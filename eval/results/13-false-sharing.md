# False sharing between CPU cores

Two threads, two counters, no shared data, and yet adding a second core makes the program
slower. The usual culprit is *false sharing*: the threads don't share variables, but their
variables happen to share a **cache line**, and the hardware moves memory between cores in
whole lines, not bytes.

## Why the line matters

Each core has its own L1 and L2 cache. Caches hold memory in 64-byte lines (on most x86 and
many ARM chips; Apple's M-series uses 128). To keep every core's view consistent, the chips
run a coherence protocol, usually a variant of MESI. Its rule is simple: a line may be read by
many cores at once, but only one core may hold it while writing.

```state-machine id=mesi title="One cache line, as seen by Core 0"
invalid: "Invalid"
shared: "Shared"
exclusive: "Exclusive"
modified: "Modified" {role=focus}
start -> invalid
invalid -> exclusive : read, no other copies
invalid -> shared : read, others have it
exclusive -> modified : write
shared -> modified : write, invalidate others
modified -> shared : another core reads
modified -> invalid : another core writes {role=error}
shared -> invalid : another core writes
steps:
  invalid -> exclusive "Core 0 reads its counter and gets the line to itself."
  exclusive -> modified "Writing is cheap while no one else has the line: it stays in Core 0's cache."
  modified -> invalid "Core 1 writes its own counter, in the same line, and Core 0's copy is thrown away."
  invalid -> shared "Core 0's next access misses and must fetch the line back from Core 1."
```

Consider a struct with two `long` counters side by side, 8 bytes apart. Thread A on Core 0
increments `a`; thread B on Core 1 increments `b`. Both fields sit in the same 64-byte line.
Every write by Core 0 needs the line in [Modified](#mesi.modified) state, which means
invalidating Core 1's copy, and vice versa. The line ping-pongs between the cores on every
increment.

```sequence id=pingpong title="Two counters, one line"
c0: service "Core 0 (writes a)"
fabric: service "Coherence fabric"
c1: service "Core 1 (writes b)"
c0 -> fabric : request ownership
fabric -> c1 : invalidate
c1 --> fabric : ack
fabric --> c0 : line, exclusive
c1 -> fabric : request ownership
fabric -> c0 : invalidate, write back
c0 --> fabric : dirty line
fabric --> c1 : line, exclusive
steps:
  c0 -> fabric : request ownership "Core 0 wants to write a, so it asks for exclusive ownership of the whole line."
  fabric -> c1 : invalidate "Core 1 loses its copy, even though it never touches a."
  c1 -> fabric : request ownership "A moment later Core 1 wants to write b, and the same exchange runs in reverse."
  c0 --> fabric : dirty line "The modified line has to travel across the chip: tens of nanoseconds, versus about one for an L1 hit."
```

Nothing here is a bug in the usual sense. The program is correct; it is just paying a cache
miss on almost every write. With an increment loop the slowdown can be ten times or more, and
it gets worse with more cores and across sockets, where the line has to cross the
interconnect.

## How to find it

False sharing hides from code review because the conflict is in the *layout*, not the logic.
The signs are scaling that gets worse as you add threads, and high cache-miss counts on
memory that no two threads logically share. On Linux, `perf c2c` reports cache lines that
bounce between cores and which offsets each core touched; Intel VTune has a similar
"memory access" view. Common offenders are per-thread counters in an array, the fields of a
lock next to the data it protects, and the head and tail indices of a queue.

## How to avoid it

The fix is always the same idea: make data written by different cores live on different
lines. There are several ways to get there.

```tradeoffs id=fixes title="Keeping hot data apart"
pad: "Pad or align to a line" {role=focus}
local: "Accumulate locally, merge once"
split: "Group data by writer"
atomic: "One shared atomic"
pad.speed : "full speed" {role=happy}
pad.memory : "64 B+ per field" {role=error}
pad.effort : "one attribute"
pad.portability : "line size varies"
local.speed : "full speed" {role=happy}
local.memory : "none extra" {role=happy}
local.effort : "restructure loop"
local.portability : "any machine" {role=happy}
split.speed : "full speed" {role=happy}
split.memory : "none extra" {role=happy}
split.effort : "redesign layout" {role=error}
split.portability : "any machine" {role=happy}
atomic.speed : "true sharing, slow" {role=error}
atomic.memory : "8 B" {role=happy}
atomic.effort : "none" {role=happy}
atomic.portability : "any machine" {role=happy}
```

[Padding and alignment](#fixes.pad) is the direct fix: `alignas(64)` in C++, or
`std::hardware_destructive_interference_size`; `@Contended` in Java; a padded struct in Go or
Rust (`crossbeam`'s `CachePadded`). It costs memory, so use it for a handful of hot fields,
not for every element of a large array.

[Accumulating locally](#fixes.local) is often better: each thread keeps its counter in a local
variable or register and writes the shared result once at the end. No coherence traffic at
all. [Grouping by writer](#fixes.split) applies the same idea to data structures: keep fields
that one thread writes together, away from fields another thread writes.

Note that [one shared atomic](#fixes.atomic) is not a fix. That is *true* sharing; it removes
the layout accident but keeps the contention. Measure before and after with `perf c2c`: a
fixed layout shows the line disappear from the report.
