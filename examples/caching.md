# Should this be cached?

"Add a cache" is the most common answer to a slow page, and often the wrong one. A cache
trades freshness for speed, and it only pays when reads far outnumber writes. Three
questions, in order, settle it.

```decision-tree id=cache title="Should this be cached?"
reads: "Read far more often than written?"
stale: "Can readers see data a minute old?"
cost: "Slow or costly to compute?"
cache: "Cache it, with a short TTL" {role=happy}
skip: "Don't cache"
fix: "Fix the query first" {role=focus}
invalidate: "Cache, and invalidate on write" {note="harder than it looks"}

reads -> stale : yes
reads -> skip : no
stale -> cost : yes
stale -> invalidate : no
cost -> cache : yes
cost --> fix : no

steps:
  reads -> stale   "A cache only pays when the same answer is read many times."
  stale -> cost    "Every cache serves stale data for a while; the product has to allow it."
  cost -> cache    "And it has to save real work. Then a short TTL is the simple, safe choice."
  cost -> fix      "If the computation is cheap, the slowness is somewhere else. Find it first."
```

The rarest branch is [fixing the query](#cache.fix): it is dashed because it is the answer
people least expect, and the one that most often turns out right. If readers must never see
stale data, [invalidating on write](#cache.invalidate) works, but every write path then has
to remember the cache.
