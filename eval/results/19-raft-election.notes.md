# 19 raft-election notes

## Types used and why
- `state-machine` (roles): follower/candidate/leader and the events that move a server between them.
- `sequence` (vote): the RequestVote / vote granted / heartbeat exchange for one election.
- `timeline` (timeouts): randomized timeouts racing each other after a leader crash.

## Checker rounds
- Round 1: 6 errors, 1 warning, all in the timeline.
  - `warning: The timeline fence is empty. fix: Add an event, e.g. 14:02 deploy: "v2.3 rolls out".`
  - `error: Unexpected text after '0': 'crash: "Leader crashes"'. fix: A line is an edge ('0 -> other : label'), a declaration ('0: "Label"') or a node with attributes ('0 {role=focus}').` (and the same for 150, 150, 180, 195, 260)
  - Told me how to fix: partly. It made clear plain numbers aren't times, but the suggested fix (treat `0` as a node id) is misleading; the real issue is that millisecond offsets aren't a supported time format. SKILL.md's list of time formats let me work it out.
- Round 2: clean, after dropping times and making it an evenly spaced sequence of stages.

## Wanted but couldn't express
- **Relative / sub-second time on a timeline.** The point of randomized timeouts is overlapping waits of different lengths (B waits 150–180 ms, C waits 150–260 ms) and B winning inside C's window. That needs spans on a relative millisecond axis (`+0ms`, `150ms`, `{until=180ms}`). Supported formats are dates and clock times only. I dropped the times and the spans, so the diagram lost the overlapping-window picture that was its reason to exist; the numbers moved into labels.
- **Several nodes in one lane over time** (a per-server swimlane of states: follower → candidate → leader per server, per term). Neither timeline nor sequence expresses "server B's state across terms". Wrote it in prose.
- **Broadcast in a sequence.** RequestVote goes to all peers in parallel; I had to write two separate messages, and steps can only pick one.
- **Term numbers as a frame.** Wanted to mark "term 5" as a region of the sequence.

## Skill gaps
- SKILL.md lists accepted time formats but doesn't say plain numbers or durations are rejected; and the checker's fix suggestion steers toward a wrong reading.
- Unclear whether a step in sequence can highlight two messages at once (the parallel RequestVotes).
