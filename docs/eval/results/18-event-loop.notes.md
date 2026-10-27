# 18 event-loop notes

## Types used and why
- `architecture` (parts): the standing parts (stack, host APIs, task queue, microtask queue) and how callbacks travel between them; edges are standing connections.
- `state-machine` (loop): one turn of the loop is a cycle of phases with transitions (run a task, drain microtasks, render).
- `timeline` without times (order): evenly spaced stages for the execution order of the worked example.

## Checker rounds
- Round 1: 0 errors, 0 warnings. Clean on first draft.

## Wanted but couldn't express
- **A stack and queue as data structures with contents.** The classic event-loop picture shows the call stack with frames on it and the two queues with callbacks lined up (`C` in microtasks, `B` in tasks), changing step by step. Press has no "stack/queue contents" or animated-state visualization; architecture can show a queue node but not what is in it at each step. I used a stage timeline plus prose.
- **Linking code to the diagram.** I wanted the code block's lines (`setTimeout(...)`, `.then(...)`) to be linkable/highlighted per step alongside the diagram. No way to reference a line of a code fence.
- **"Drain until empty" semantics.** A self-loop `drain_micro -> drain_micro` approximates "repeat until empty", but there's no notion of a guard/loop condition distinct from the edge label.
- `direction=right` on the fence was accepted silently; I don't know whether it took effect or what values are valid.

## Skill gaps
- `direction` is mentioned as the only layout hint but its syntax and allowed values are never shown.
- The "maybe render" phase is conditional; no way (or guidance) to mark an optional state/edge (dashed `-->` might be it, but its meaning in state-machine isn't defined).
- Unclear whether edges between untimed timeline events are meaningful/rendered.
