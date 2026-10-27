# 03 k8s-deploy: notes

## Types used and why
- `architecture` (k8s): who the components are and the hub-and-spoke shape (everything talks to the API server, only it talks to etcd). These are standing connections, so architecture's edges mean the right thing.
- `sequence` (flow): the causal chain from `kubectl apply` to a running Pod, in order, with five steps.

## Checker rounds
- Round 1 (first draft copy): 0 errors, 0 warnings. No changes needed.
- Rendered to check: the architecture diagram is very wide (~1400 px) because of the two groups plus eight edges. Acceptable, but I had no lever besides `direction` to make it more compact, and didn't try.

## Wanted but couldn't express
- **Watch / notification as a distinct kind of message.** In reality controllers don't receive calls from the API server; they hold a watch and get events. I drew `api -> dc : Deployment changed` as an ordinary message, which slightly misrepresents it. A dashed or "event" message style meaning "notification via watch" would have been accurate. (`-->` is reserved for replies.)
- **Asynchronous / independent loops.** The key idea is that each controller is its own reconcile loop running concurrently. A sequence implies a single ordered thread. I wanted to show "kubectl returns here, everything below is async": a divider or annotation on the sequence. Covered in prose and in the first step caption.
- **The reconcile loop itself** (observe -> diff -> act -> observe) as a small cycle. A `causal-loop` doesn't fit (no polarities) and a `state-machine` would be odd. Left to prose.
- **Rolling update** (old ReplicaSet scaling down while new scales up): a timeline with overlapping spans would suit it, but it is a second idea, so I left it to prose to keep the doc focused.

## Skill gaps
- Not clear whether one doc can refer to the same node id in two diagrams (`api` exists in both); I used `#flow.api` vs `#k8s.api` and it worked, but the skill only shows the `#diagram.node` form without saying ids are scoped per diagram.
- No advice on handling wide architecture diagrams.
