# How Raft elects a leader

Raft is a consensus algorithm: it lets a cluster of servers, usually three or five, agree on
a single ordered log of commands even when some of them crash or the network drops messages.
Raft makes this tractable by having one **leader** at a time. The leader accepts client
requests, appends them to its log and replicates them to the others. Everything else in
Raft is simpler because of that one decision, so the question becomes: how does the cluster
pick a leader, and pick a new one when the old one disappears, without ever ending up with
two?

## Three roles

Every server is in one of three states, and only a handful of events move it between them.

```state-machine id=roles title="Raft server roles"
start -> follower
follower -> candidate : election timeout
candidate -> candidate : split vote, timeout again
candidate -> leader : majority of votes {role=happy}
candidate -> follower : sees current leader or higher term
leader -> follower : sees higher term {role=error}
steps:
  follower -> candidate "A follower that hears nothing from a leader for its election timeout assumes the leader is gone and stands for election."
  candidate -> leader "If a majority of the cluster votes for it in this term, it becomes leader and starts sending heartbeats at once."
  candidate -> candidate "If the votes split and nobody wins, each candidate times out again and starts a fresh election in a new term."
  leader -> follower "A leader that learns of a higher term, for instance after a network partition heals, steps down immediately."
```

Every server starts as a [follower](#roles.follower). Followers are passive: they respond to
the leader and to candidates and never start anything themselves, as long as they keep
hearing from a leader. The leader sends a heartbeat (an empty `AppendEntries` message) every
few tens of milliseconds to keep it that way.

## Terms: Raft's logical clock

Time in Raft is divided into numbered **terms**. Each term begins with an election, and at
most one leader can win it. Every message carries the sender's term. Two rules make terms
work:

- If a server sees a term higher than its own, it adopts that term and becomes a follower.
- If a server receives a request with a term lower than its own, it rejects it.

These rules are what retire a stale leader. A leader that was cut off by a partition may
still think it is in charge, but as soon as it talks to anyone who has moved on, it sees the
[higher term and steps down](#roles.leader).

## An election, message by message

When a follower's election timeout expires, it increments its term, becomes a
[candidate](#roles.candidate), votes for itself and asks every other server for its vote.

```sequence id=vote title="Server A wins the election for term 5"
a: service "A (candidate)"
b: service "B"
c: service "C"
a -> b : RequestVote(term 5, last log 4/17)
a -> c : RequestVote(term 5, last log 4/17)
b --> a : vote granted {role=happy}
c --> a : vote granted
a -> b : AppendEntries heartbeat {role=focus}
a -> c : AppendEntries heartbeat {role=focus}
steps:
  a -> b : RequestVote(term 5, last log 4/17) "A starts term 5, votes for itself and asks the others."
  b --> a "B has not voted in term 5 and A's log is at least as up to date as its own, so B grants the vote."
  a -> b : AppendEntries heartbeat "With its own vote and B's, A has two of three: a majority. It becomes leader and announces itself with heartbeats."
```

A server grants its vote only if three things hold:

1. **It has not already voted in this term.** Each server votes at most once per term, first
   come, first served, and records the vote on disk before replying. Since a winner needs a
   majority and two majorities always overlap, two candidates can never both win the same
   term.
2. **The candidate's term is at least as high as its own.**
3. **The candidate's log is at least as up to date as its own.** Compare the term of the last
   entry first, then the log length. This *election restriction* is what guarantees that the
   new leader already holds every committed entry, so a leader never has to fetch missing
   history.

The candidate wins once it has votes from a majority, counting its own. It does not need to
wait for the rest.

## Split votes and randomized timeouts

What if two followers time out at the same moment? Both become candidates, both vote for
themselves, and the remaining votes may split so that neither reaches a majority. The term
ends with no leader, both time out and they try again in the next term.

If every server used the same timeout, this could repeat forever. Raft's fix is almost
embarrassingly simple: each server picks its election timeout **at random**, typically
between 150 and 300 ms, and picks a new one for every election.

```timeline id=timeouts title="Randomized timeouts break the tie"
0 crash: "Leader crashes" {role=error}
150 b_wait: "B waiting" {until=180, role=muted}
150 c_wait: "C waiting" {until=260, role=muted}
180 b_cand: "B times out, starts term 6" {role=focus}
195 b_wins: "B has a majority, sends heartbeats" {role=happy}
260 c_reset: "C would have timed out, but already heard B"
```

Usually one server times out well before the others, wins the election and starts sending
heartbeats before anyone else's timer runs out. Those heartbeats reset the other followers'
timers, so they never become candidates at all. Split votes still happen, but rarely, and
the next round almost always resolves them.

## Why it is safe

Put together, Raft's election guarantees that at most one leader exists per term (one vote
per server per term, majority required) and that the leader of any term already holds
every committed entry (the election restriction). Two servers may briefly *believe* they
are leader, an old one in an old term and a new one in a new term, but the old one cannot
commit anything, because a majority has already moved to the higher term and will reject
it.
